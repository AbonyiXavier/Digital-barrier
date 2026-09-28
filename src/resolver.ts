/**
 * The filtering DNS forwarder.
 *
 * Every query hits one decision: blocked names get a sinkhole answer built
 * locally, everything else is relayed verbatim to an upstream resolver and the
 * upstream's reply is handed straight back. Relaying raw bytes means we stay
 * correct for record types we have never heard of.
 */

import { createSocket, type Socket as UdpSocket } from "node:dgram";
import { connect, createServer, type Server as TcpServer, type Socket } from "node:net";

import type { Blocklist } from "./blocklist.js";
import type { SafeSearch } from "./safesearch.js";
import * as wire from "./wire.js";

export const DEFAULT_UPSTREAMS = ["1.1.1.1", "8.8.8.8"] as const;
export const SINKHOLE_V4 = "0.0.0.0";
export const SINKHOLE_V6 = "::";
/** Short, so turning protection off takes effect quickly. */
export const SINKHOLE_TTL = 60;
export const UPSTREAM_TIMEOUT_MS = 2000;
/** Short enough that turning safe search off takes effect quickly. */
export const REDIRECT_TTL = 300;

/**
 * Answered locally: liveness probes must not depend on the internet, and they
 * have no place in an accountability log.
 */
export const HEALTH_NAME = "health-check.digital-barrier.invalid";

export type Action = "BLOCKED" | "ALLOWED" | "SAFESEARCH" | "SERVFAIL" | "MALFORMED";

export interface QueryEvent {
  client: string;
  name: string;
  qtype: string;
  action: Action;
  rule: string | null;
}

export type QueryLogger = (event: QueryEvent) => void;

export interface Stats {
  total: number;
  blocked: number;
  allowed: number;
  errors: number;
  uptimeSeconds: number;
}

export class Resolver {
  private counts = { total: 0, blocked: 0, allowed: 0, redirected: 0, errors: 0 };
  private readonly startedAt = Date.now();

  constructor(
    private readonly blocklist: Blocklist,
    private readonly upstreams: readonly string[] = DEFAULT_UPSTREAMS,
    private readonly onQuery: QueryLogger = () => {},
    private readonly safeSearch?: SafeSearch,
  ) {}

  get stats(): Stats {
    return { ...this.counts, uptimeSeconds: (Date.now() - this.startedAt) / 1000 };
  }

  private record(kind: "blocked" | "allowed" | "redirected" | "errors"): void {
    this.counts.total += 1;
    this.counts[kind] += 1;
  }

  async handle(data: Buffer, client: string, overTcp = false): Promise<Buffer> {
    let query: wire.Query;
    try {
      query = wire.parseQuery(data);
    } catch (error) {
      this.record("errors");
      this.onQuery({
        client, name: "?", qtype: "?", action: "MALFORMED",
        rule: error instanceof Error ? error.message : String(error),
      });
      return wire.buildBareError(data, wire.RCODE_FORMERR);
    }

    if (query.name === HEALTH_NAME) {
      return wire.buildError(query, data, wire.RCODE_NXDOMAIN);
    }

    const qtype = wire.typeName(query.qtype);
    const decision = this.blocklist.decide(query.name);
    if (!decision.allowed) {
      this.record("blocked");
      this.onQuery({ client, name: query.name, qtype, action: "BLOCKED", rule: decision.rule });
      return wire.buildSinkhole(query, data, SINKHOLE_V4, SINKHOLE_V6, SINKHOLE_TTL);
    }

    // Safe search: answer with the engine's safe host instead of its real one.
    // Checked after the blocklist so an outright block always wins.
    const target = this.safeSearch?.target(query.name) ?? null;
    if (target !== null) {
      const redirected = await this.redirect(query, data, target, overTcp);
      if (redirected !== null) {
        this.record("redirected");
        this.onQuery({
          client, name: query.name, qtype, action: "SAFESEARCH", rule: target,
        });
        return redirected;
      }
      // Fall through to a normal lookup rather than break the search engine.
    }

    const response = await this.forward(data, overTcp);
    if (response === null) {
      this.record("errors");
      this.onQuery({
        client, name: query.name, qtype, action: "SERVFAIL", rule: "upstream unreachable",
      });
      return wire.buildError(query, data, wire.RCODE_SERVFAIL);
    }

    this.record("allowed");
    this.onQuery({
      client, name: query.name, qtype, action: "ALLOWED",
      rule: decision.source === "allowlist" ? decision.rule : null,
    });
    return response;
  }

  /**
   * Resolve the safe-search host and answer with its addresses under the name
   * the client asked for. The site sees its own SNI and serves a valid
   * certificate; only the results change.
   *
   * The target is resolved live on every query rather than pinned to an IP,
   * so it follows the engine whenever they move it.
   */
  private async redirect(
    query: wire.Query, raw: Buffer, target: string, overTcp: boolean,
  ): Promise<Buffer | null> {
    if (query.qclass !== wire.CLASS_IN) return null;
    // Anything that is not an address question gets NODATA, so an HTTPS/SVCB
    // record cannot hand the client the unfiltered endpoint.
    if (query.qtype !== wire.TYPE_A && query.qtype !== wire.TYPE_AAAA) {
      return wire.buildAddressAnswer(query, raw, [], REDIRECT_TTL);
    }
    const { packet } = wire.buildQuery(target, query.qtype);
    const answer = await this.forward(packet, overTcp);
    if (answer === null) return null;

    let addresses: string[];
    try {
      addresses = readAddresses(answer);
    } catch {
      return null;
    }
    if (addresses.length === 0) return null;
    return wire.buildAddressAnswer(query, raw, addresses, REDIRECT_TTL);
  }

  private async forward(data: Buffer, overTcp: boolean): Promise<Buffer | null> {
    for (const upstream of this.upstreams) {
      try {
        return overTcp
          ? await forwardTcp(data, upstream)
          : await forwardUdp(data, upstream);
      } catch {
        // Try the next upstream.
      }
    }
    return null;
  }
}

/** Pull the A/AAAA addresses out of an upstream answer. */
function readAddresses(data: Buffer): string[] {
  if (data.length < wire.HEADER_LEN) return [];
  const qdcount = data.readUInt16BE(4);
  const ancount = data.readUInt16BE(6);
  let off = wire.HEADER_LEN;
  for (let i = 0; i < qdcount; i += 1) off = skipName(data, off) + 4;

  const addresses: string[] = [];
  for (let i = 0; i < ancount; i += 1) {
    off = skipName(data, off);
    if (off + 10 > data.length) break;
    const rtype = data.readUInt16BE(off);
    const rdlength = data.readUInt16BE(off + 8);
    off += 10;
    const rdata = data.subarray(off, off + rdlength);
    off += rdlength;
    if (rtype === wire.TYPE_A && rdlength === 4) addresses.push(wire.decodeIPv4(rdata));
    else if (rtype === wire.TYPE_AAAA && rdlength === 16) {
      addresses.push(wire.decodeIPv6(rdata));
    }
  }
  return addresses;
}

/** Advance past a name, following the length/pointer encoding. */
function skipName(data: Buffer, start: number): number {
  let off = start;
  for (;;) {
    if (off >= data.length) throw new Error("truncated name");
    const size = data.readUInt8(off);
    if (size === 0) return off + 1;
    if ((size & 0xc0) === 0xc0) return off + 2;
    off += 1 + size;
  }
}

function forwardUdp(data: Buffer, upstream: string): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createSocket("udp4");
    let settled = false;
    let timer: NodeJS.Timeout;

    const finish = (error: Error | null, response?: Buffer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close(() => {
        if (error !== null) rejectPromise(error);
        else resolvePromise(response as Buffer);
      });
    };

    timer = setTimeout(() => finish(new Error("upstream timeout")), UPSTREAM_TIMEOUT_MS);
    socket.on("error", (error) => finish(error));
    socket.on("message", (message, remote) => {
      // Ignore anything that is not this upstream answering this query.
      if (remote.address === upstream && message.length >= 2 &&
          message.readUInt16BE(0) === data.readUInt16BE(0)) {
        finish(null, message);
      }
    });
    socket.send(data, 53, upstream, (error) => {
      if (error) finish(error);
    });
  });
}

function forwardTcp(data: Buffer, upstream: string): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connect({ host: upstream, port: 53 });
    let chunks = Buffer.alloc(0);
    let settled = false;

    const finish = (error: Error | null, response?: Buffer): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error !== null) rejectPromise(error);
      else resolvePromise(response as Buffer);
    };

    socket.setTimeout(UPSTREAM_TIMEOUT_MS, () => finish(new Error("upstream timeout")));
    socket.on("error", (error) => finish(error));
    socket.on("close", () => finish(new Error("upstream closed early")));
    socket.on("connect", () => socket.write(frame(data)));
    socket.on("data", (chunk: Buffer) => {
      chunks = Buffer.concat([chunks, chunk]);
      if (chunks.length < 2) return;
      const expected = chunks.readUInt16BE(0);
      if (chunks.length >= 2 + expected) finish(null, chunks.subarray(2, 2 + expected));
    });
  });
}

/** Prefix a message with its 2-byte length, as DNS-over-TCP requires. */
function frame(message: Buffer): Buffer {
  const header = Buffer.alloc(2);
  header.writeUInt16BE(message.length, 0);
  return Buffer.concat([header, message]);
}

export interface ServerHandle {
  port: number;
  close: () => Promise<void>;
}

/** Start UDP and TCP listeners on the same port. */
export function serve(resolver: Resolver, host = "127.0.0.1", port = 53): Promise<ServerHandle> {
  const udp: UdpSocket = createSocket({ type: "udp4", reuseAddr: true });
  const tcp: TcpServer = createServer();

  udp.on("message", (message, remote) => {
    void resolver.handle(message, remote.address).then(
      (response) => udp.send(response, remote.port, remote.address, () => {}),
      () => {}, // a failed reply is a dropped query, not a crashed resolver
    );
  });

  tcp.on("connection", (socket: Socket) => handleTcpConnection(resolver, socket));

  return new Promise((resolvePromise, rejectPromise) => {
    let pending = 2;
    let failed = false;
    const fail = (error: Error): void => {
      if (failed) return;
      failed = true;
      udp.close();
      tcp.close();
      rejectPromise(error);
    };
    const ready = (): void => {
      pending -= 1;
      if (pending === 0 && !failed) {
        resolvePromise({
          port,
          close: async () => {
            await Promise.all([
              new Promise<void>((done) => udp.close(() => done())),
              new Promise<void>((done) => tcp.close(() => done())),
            ]);
          },
        });
      }
    };
    udp.once("error", fail);
    tcp.once("error", fail);
    udp.bind(port, host, ready);
    tcp.listen(port, host, ready);
  });
}

/** A TCP connection may carry several length-prefixed queries in sequence. */
function handleTcpConnection(resolver: Resolver, socket: Socket): void {
  let buffered = Buffer.alloc(0);
  socket.setTimeout(UPSTREAM_TIMEOUT_MS * 2, () => socket.destroy());
  socket.on("error", () => socket.destroy());
  socket.on("data", (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (;;) {
      if (buffered.length < 2) return;
      const expected = buffered.readUInt16BE(0);
      if (buffered.length < 2 + expected) return;
      const message = buffered.subarray(2, 2 + expected);
      buffered = buffered.subarray(2 + expected);
      void resolver.handle(message, socket.remoteAddress ?? "?", true).then(
        (response) => {
          if (!socket.destroyed) socket.write(frame(response));
        },
        () => socket.destroy(),
      );
    }
  });
}
