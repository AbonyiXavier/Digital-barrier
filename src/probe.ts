/**
 * A tiny DNS client, used for health checks and tests.
 *
 * Enough of an answer parser to pull addresses and the rcode out of a reply, so
 * the CLI and the test suite can verify behaviour without shelling out to dig.
 */

import { createSocket } from "node:dgram";
import { connect } from "node:net";
import { domainToASCII } from "node:url";

import * as wire from "./wire.js";

const RCODE_NAMES: Record<number, string> = {
  0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN", 4: "NOTIMP", 5: "REFUSED",
};

/** Reserved name the resolver answers locally, so health checks need no network. */
export const HEALTH_NAME = "health-check.digital-barrier.invalid";

export interface Answer {
  rcode: number;
  rcodeName: string;
  addresses: string[];
  ancount: number;
}

export interface QueryOptions {
  host?: string;
  port?: number;
  qtype?: number;
  timeoutMs?: number;
  tcp?: boolean;
  edns?: boolean;
}

export function encodeName(name: string): Buffer {
  const trimmed = name.replace(/\.+$/, "");
  if (trimmed === "") return Buffer.from([0]);
  const parts: Buffer[] = [];
  for (const label of trimmed.split(".")) {
    const ascii = /^[\x00-\x7f]*$/.test(label) ? label : domainToASCII(label);
    const encoded = Buffer.from(ascii, "latin1");
    if (encoded.length > 63) throw new Error(`label too long: ${label}`);
    parts.push(Buffer.from([encoded.length]), encoded);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

export function buildQuery(
  name: string,
  qtype = wire.TYPE_A,
  options: { txid?: number; edns?: boolean } = {},
): { txid: number; packet: Buffer } {
  const txid = options.txid ?? Math.floor(Math.random() * 0x10000);
  const edns = options.edns ?? true;
  const header = Buffer.alloc(wire.HEADER_LEN);
  header.writeUInt16BE(txid, 0);
  header.writeUInt16BE(wire.RD, 2);
  header.writeUInt16BE(1, 4); // qdcount
  header.writeUInt16BE(edns ? 1 : 0, 10); // arcount
  const question = Buffer.concat([encodeName(name), Buffer.alloc(4)]);
  question.writeUInt16BE(qtype, question.length - 4);
  question.writeUInt16BE(wire.CLASS_IN, question.length - 2);
  const opt = Buffer.alloc(11);
  opt.writeUInt16BE(wire.TYPE_OPT, 1);
  opt.writeUInt16BE(wire.EDNS_PAYLOAD, 3);
  return { txid, packet: Buffer.concat(edns ? [header, question, opt] : [header, question]) };
}

/** Advance past a name, following the length/pointer encoding. */
function skipName(data: Buffer, start: number): number {
  let off = start;
  for (;;) {
    if (off >= data.length) throw new Error("truncated name");
    const size = data.readUInt8(off);
    if (size === 0) return off + 1;
    if ((size & 0xc0) === 0xc0) return off + 2; // pointer ends the name
    off += 1 + size;
  }
}

export function parseAnswer(data: Buffer): Answer {
  if (data.length < wire.HEADER_LEN) throw new Error("short response");
  const flags = data.readUInt16BE(2);
  const rcode = flags & 0x000f;
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
    else if (rtype === wire.TYPE_AAAA && rdlength === 16) addresses.push(wire.decodeIPv6(rdata));
  }
  return { rcode, rcodeName: RCODE_NAMES[rcode] ?? `RCODE${rcode}`, addresses, ancount };
}

function udpExchange(
  packet: Buffer, txid: number, host: string, port: number, timeoutMs: number,
): Promise<Buffer> {
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

    timer = setTimeout(() => finish(new Error(`DNS query timed out after ${timeoutMs}ms`)),
      timeoutMs);
    socket.on("error", (error) => finish(error));
    socket.on("message", (message) => {
      // Ignore anything that is not an answer to this query.
      if (message.length >= 2 && message.readUInt16BE(0) === txid) finish(null, message);
    });
    socket.send(packet, port, host, (error) => {
      if (error) finish(error);
    });
  });
}

function tcpExchange(
  packet: Buffer, host: string, port: number, timeoutMs: number,
): Promise<Buffer> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = connect({ host, port });
    let chunks = Buffer.alloc(0);
    let settled = false;

    const finish = (error: Error | null, response?: Buffer): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error !== null) rejectPromise(error);
      else resolvePromise(response as Buffer);
    };

    socket.setTimeout(timeoutMs, () =>
      finish(new Error(`DNS query timed out after ${timeoutMs}ms`)));
    socket.on("error", (error) => finish(error));
    socket.on("close", () => finish(new Error("connection closed before a full answer")));
    socket.on("connect", () => {
      const framed = Buffer.alloc(2);
      framed.writeUInt16BE(packet.length, 0);
      socket.write(Buffer.concat([framed, packet]));
    });
    socket.on("data", (chunk: Buffer) => {
      chunks = Buffer.concat([chunks, chunk]);
      if (chunks.length < 2) return;
      const expected = chunks.readUInt16BE(0);
      if (chunks.length >= 2 + expected) finish(null, chunks.subarray(2, 2 + expected));
    });
  });
}

/** Send one query and return the parsed answer. */
export async function query(name: string, options: QueryOptions = {}): Promise<Answer> {
  const {
    host = "127.0.0.1", port = 53, qtype = wire.TYPE_A,
    timeoutMs = 3000, tcp = false, edns = true,
  } = options;
  const { txid, packet } = buildQuery(name, qtype, { edns });
  const response = tcp
    ? await tcpExchange(packet, host, port, timeoutMs)
    : await udpExchange(packet, txid, host, port, timeoutMs);
  return parseAnswer(response);
}

/**
 * Is a Digital Barrier resolver answering here?
 *
 * Uses a reserved .invalid name the resolver answers locally, so the check
 * works with no upstream connectivity and leaves the query log clean.
 */
export async function healthy(host = "127.0.0.1", port = 53, timeoutMs = 1000): Promise<boolean> {
  try {
    await query(HEALTH_NAME, { host, port, timeoutMs });
    return true;
  } catch {
    return false;
  }
}
