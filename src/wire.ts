/**
 * Minimal DNS wire-format handling (RFC 1035 / RFC 6891).
 *
 * Only what a filtering forwarder needs: read the question out of a query, and
 * build either a sinkhole answer or an error response. Everything we decide to
 * allow is relayed to the upstream resolver byte-for-byte, so we never have to
 * parse a full answer section.
 */

// Header flag bits.
export const QR = 0x8000;
export const OPCODE_MASK = 0x7800;
export const AA = 0x0400;
export const TC = 0x0200;
export const RD = 0x0100;
export const RA = 0x0080;

export const RCODE_NOERROR = 0;
export const RCODE_FORMERR = 1;
export const RCODE_SERVFAIL = 2;
export const RCODE_NXDOMAIN = 3;
export const RCODE_REFUSED = 5;

export const TYPE_A = 1;
export const TYPE_AAAA = 28;
export const TYPE_OPT = 41;
export const TYPE_HTTPS = 65;
export const CLASS_IN = 1;

export const HEADER_LEN = 12;
export const MAX_NAME_LEN = 255;
export const EDNS_PAYLOAD = 1232;

const TYPE_NAMES: Record<number, string> = {
  1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT",
  28: "AAAA", 33: "SRV", 35: "NAPTR", 43: "DS", 48: "DNSKEY", 64: "SVCB",
  65: "HTTPS", 255: "ANY",
};

export function typeName(qtype: number): string {
  return TYPE_NAMES[qtype] ?? `TYPE${qtype}`;
}

/** The datagram is not a DNS query we can reason about. */
export class MalformedQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedQueryError";
  }
}

export interface Query {
  txid: number;
  flags: number;
  qdcount: number;
  ancount: number;
  nscount: number;
  arcount: number;
  /** Lower-cased, no trailing dot. */
  name: string;
  qtype: number;
  qclass: number;
  /** Offset just past the question section. */
  qend: number;
}

/** Read an uncompressed QNAME. Questions never use compression pointers. */
function readName(data: Buffer, start: number): { name: string; end: number } {
  const labels: string[] = [];
  let off = start;
  let length = 0;
  for (;;) {
    if (off >= data.length) throw new MalformedQueryError("truncated name");
    const size = data.readUInt8(off);
    if (size === 0) return { name: labels.join("."), end: off + 1 };
    if ((size & 0xc0) !== 0) {
      throw new MalformedQueryError("compression pointer in question");
    }
    off += 1;
    if (off + size > data.length) throw new MalformedQueryError("truncated label");
    labels.push(data.subarray(off, off + size).toString("latin1").toLowerCase());
    off += size;
    length += size + 1;
    if (length > MAX_NAME_LEN) throw new MalformedQueryError("name too long");
  }
}

export function parseQuery(data: Buffer): Query {
  if (data.length < HEADER_LEN) throw new MalformedQueryError("short header");
  const txid = data.readUInt16BE(0);
  const flags = data.readUInt16BE(2);
  if ((flags & QR) !== 0) throw new MalformedQueryError("not a query");
  const qdcount = data.readUInt16BE(4);
  if (qdcount < 1) throw new MalformedQueryError("no question");
  const { name, end } = readName(data, HEADER_LEN);
  if (end + 4 > data.length) throw new MalformedQueryError("truncated question");
  return {
    txid,
    flags,
    qdcount,
    ancount: data.readUInt16BE(6),
    nscount: data.readUInt16BE(8),
    arcount: data.readUInt16BE(10),
    name,
    qtype: data.readUInt16BE(end),
    qclass: data.readUInt16BE(end + 2),
    qend: end + 4,
  };
}

/** A bare EDNS(0) OPT record: root name, type 41, our UDP payload size. */
function optRecord(): Buffer {
  const buf = Buffer.alloc(11);
  buf.writeUInt8(0, 0); // root name
  buf.writeUInt16BE(TYPE_OPT, 1);
  buf.writeUInt16BE(EDNS_PAYLOAD, 3); // class carries the payload size
  buf.writeUInt32BE(0, 5); // extended rcode + version + flags
  buf.writeUInt16BE(0, 9); // rdlength
  return buf;
}

function assemble(query: Query, raw: Buffer, rcode: number, answers: Buffer[]): Buffer {
  const flags =
    QR | RA | AA | (query.flags & OPCODE_MASK) | (query.flags & RD) | rcode;
  // Echo an OPT record only if the client offered one, so EDNS stays symmetric.
  const extra = query.arcount > 0 ? optRecord() : Buffer.alloc(0);
  const header = Buffer.alloc(HEADER_LEN);
  header.writeUInt16BE(query.txid, 0);
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(1, 4); // qdcount
  header.writeUInt16BE(answers.length, 6);
  header.writeUInt16BE(0, 8); // nscount
  header.writeUInt16BE(extra.length > 0 ? 1 : 0, 10);
  const question = raw.subarray(HEADER_LEN, query.qend);
  return Buffer.concat([header, question, ...answers, extra]);
}

function resourceRecord(qtype: number, ttl: number, rdata: Buffer): Buffer {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0xc00c, 0); // pointer to the question's name at offset 12
  head.writeUInt16BE(qtype, 2);
  head.writeUInt16BE(CLASS_IN, 4);
  head.writeUInt32BE(ttl, 6);
  head.writeUInt16BE(rdata.length, 10);
  return Buffer.concat([head, rdata]);
}

/**
 * Answer the question with addresses we chose, under the name that was asked
 * for. Used both to sinkhole a blocked name and to point a search engine at its
 * safe-search host.
 *
 * Any type other than A/AAAA gets NODATA: the name exists, it just has nothing
 * of the type asked for. That matters for HTTPS/SVCB, whose ipv4hint/ipv6hint
 * fields would otherwise hand the client the real endpoint and route around us.
 */
export function buildAddressAnswer(
  query: Query,
  raw: Buffer,
  addresses: readonly string[],
  ttl: number,
): Buffer {
  if (query.qclass !== CLASS_IN ||
      (query.qtype !== TYPE_A && query.qtype !== TYPE_AAAA)) {
    return assemble(query, raw, RCODE_NOERROR, []);
  }
  const wantV6 = query.qtype === TYPE_AAAA;
  const answers: Buffer[] = [];
  for (const address of addresses) {
    const isV6 = address.includes(":");
    if (isV6 !== wantV6) continue; // never answer an A question with a v6 address
    try {
      const rdata = isV6 ? encodeIPv6(address) : encodeIPv4(address);
      answers.push(resourceRecord(query.qtype, ttl, rdata));
    } catch {
      // An unparseable address is simply not offered.
    }
  }
  return assemble(query, raw, RCODE_NOERROR, answers);
}

/** Answer a blocked name with a dead address (or NODATA for other types). */
export function buildSinkhole(
  query: Query,
  raw: Buffer,
  ipv4: string,
  ipv6: string,
  ttl: number,
): Buffer {
  return buildAddressAnswer(query, raw, [query.qtype === TYPE_AAAA ? ipv6 : ipv4], ttl);
}

/** Encode a domain name in DNS label form. */
export function encodeName(name: string): Buffer {
  const trimmed = name.replace(/\.+$/, "");
  if (trimmed === "") return Buffer.from([0]);
  const parts: Buffer[] = [];
  for (const label of trimmed.split(".")) {
    const encoded = Buffer.from(label, "latin1");
    if (encoded.length > 63) throw new Error(`label too long: ${label}`);
    parts.push(Buffer.from([encoded.length]), encoded);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** Build a recursive query, for asking an upstream resolver something. */
export function buildQuery(
  name: string,
  qtype: number,
  options: { txid?: number; edns?: boolean } = {},
): { txid: number; packet: Buffer } {
  const txid = options.txid ?? Math.floor(Math.random() * 0x10000);
  const edns = options.edns ?? true;
  const header = Buffer.alloc(HEADER_LEN);
  header.writeUInt16BE(txid, 0);
  header.writeUInt16BE(RD, 2);
  header.writeUInt16BE(1, 4); // qdcount
  header.writeUInt16BE(edns ? 1 : 0, 10); // arcount
  const tail = Buffer.alloc(4);
  tail.writeUInt16BE(qtype, 0);
  tail.writeUInt16BE(CLASS_IN, 2);
  const question = Buffer.concat([encodeName(name), tail]);
  return {
    txid,
    packet: Buffer.concat(edns ? [header, question, optRecord()] : [header, question]),
  };
}

export function buildError(query: Query, raw: Buffer, rcode: number): Buffer {
  return assemble(query, raw, rcode, []);
}

/** Error response for a query too broken to parse a question out of. */
export function buildBareError(raw: Buffer, rcode: number): Buffer {
  const header = Buffer.alloc(HEADER_LEN);
  header.writeUInt16BE(raw.length >= 2 ? raw.readUInt16BE(0) : 0, 0);
  header.writeUInt16BE(QR | RA | rcode, 2);
  return header;
}

export function encodeIPv4(address: string): Buffer {
  const parts = address.split(".");
  if (parts.length !== 4) throw new Error(`invalid IPv4 address: ${address}`);
  const buf = Buffer.alloc(4);
  parts.forEach((part, index) => {
    const value = Number(part);
    if (!/^\d{1,3}$/.test(part) || value > 255) {
      throw new Error(`invalid IPv4 address: ${address}`);
    }
    buf.writeUInt8(value, index);
  });
  return buf;
}

export function decodeIPv4(rdata: Buffer): string {
  return Array.from(rdata).join(".");
}

/** Parse an IPv6 literal, including `::` compression. No embedded-IPv4 form. */
export function encodeIPv6(address: string): Buffer {
  const halves = address.split("::");
  if (halves.length > 2) throw new Error(`invalid IPv6 address: ${address}`);
  const toGroups = (text: string): number[] =>
    text === ""
      ? []
      : text.split(":").map((group) => {
          if (!/^[0-9a-f]{1,4}$/i.test(group)) {
            throw new Error(`invalid IPv6 address: ${address}`);
          }
          return parseInt(group, 16);
        });
  const head = toGroups(halves[0] ?? "");
  const tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const groups =
    halves.length === 2
      ? [...head, ...new Array<number>(8 - head.length - tail.length).fill(0), ...tail]
      : head;
  if (groups.length !== 8) throw new Error(`invalid IPv6 address: ${address}`);
  const buf = Buffer.alloc(16);
  groups.forEach((group, index) => buf.writeUInt16BE(group, index * 2));
  return buf;
}

/** Render 16 bytes as an IPv6 literal, compressing the longest run of zeros. */
export function decodeIPv6(rdata: Buffer): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(rdata.readUInt16BE(i));

  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let i = 0; i <= groups.length; i += 1) {
    if (i < groups.length && groups[i] === 0) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      if (i - runStart > bestLength) {
        bestStart = runStart;
        bestLength = i - runStart;
      }
      runStart = -1;
    }
  }
  if (bestLength < 2) return groups.map((g) => g.toString(16)).join(":");
  const head = groups.slice(0, bestStart).map((g) => g.toString(16)).join(":");
  const tail = groups.slice(bestStart + bestLength).map((g) => g.toString(16)).join(":");
  return `${head}::${tail}`;
}
