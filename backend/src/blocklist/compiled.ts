/**
 * The compiled blocklist: what a device downloads instead of 600k strings.
 *
 * Why this exists. The macOS resolver holds the rules in a `Set<string>`, which
 * measures ~110 MB at 600k domains. That is fine on a Mac and impossible inside
 * an iOS Network Extension, whose whole process — our code and every library in
 * it — has to fit in 50 MiB on iOS 15+ (15 MB before that). Parsing the text
 * artifact on device is the thing that cannot be done.
 *
 * So the server does the work once: each domain is hashed to 64 bits and the
 * hashes are written out sorted. 600k domains is 4.8 MB, a client binary-searches
 * it, and nothing has to be parsed at all — the bytes are the index.
 *
 * FORMAT (little-endian throughout)
 *
 *   offset  size   field
 *   0       4      magic, ASCII "AEGB"
 *   4       1      format version, currently 1
 *   5       1      hash id, currently 1 = FNV-1a 64
 *   6       2      reserved, zero
 *   8       4      count, number of hashes
 *   12      8*n    the hashes, ascending
 *
 * A client MUST reject a payload whose magic, version or hash id it does not
 * know, rather than guess: a mis-parsed blocklist either blocks everything or
 * nothing, and both are worse than refusing to start.
 *
 * MATCHING. Hash the queried name, then each parent suffix, and look each up:
 * `a.b.example.com` tries `a.b.example.com`, `b.example.com`, `example.com`,
 * `com`. That reproduces the label-wise rule exactly — `pornhub.com` matches
 * `www.pornhub.com` and never `notpornhub.com` — in at most a handful of
 * binary searches.
 *
 * A 64-bit collision would block one unrelated domain, and the allowlist already
 * exists to undo exactly that. At 600k entries the chance is about 1 in 10^8.
 */

export const MAGIC = 0x42474541; // "AEGB" read little-endian
export const FORMAT_VERSION = 1;
export const HASH_FNV1A64 = 1;
export const HEADER_BYTES = 12;

const FNV_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x0000_0100_0000_01b3n;
const MASK_64 = 0xffff_ffff_ffff_ffffn;

/**
 * FNV-1a, 64-bit, over the UTF-8 bytes of an already-normalised name.
 *
 * Chosen because it is trivial to reimplement identically in Swift, Kotlin and
 * C — the clients must agree with this byte for byte, and a cryptographic hash
 * would buy nothing here while being far easier to get subtly wrong.
 */
export function hashDomain(domain: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  const bytes = Buffer.from(domain, 'utf8');
  for (const byte of bytes) {
    hash = (hash ^ BigInt(byte)) & MASK_64;
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/** Builds the artifact. `domains` need not be sorted or unique. */
export function compile(domains: Iterable<string>): Buffer {
  const seen = new Set<bigint>();
  for (const domain of domains) {
    if (domain === '') continue;
    seen.add(hashDomain(domain));
  }
  const sorted = [...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const out = Buffer.alloc(HEADER_BYTES + sorted.length * 8);
  out.writeUInt32LE(MAGIC, 0);
  out.writeUInt8(FORMAT_VERSION, 4);
  out.writeUInt8(HASH_FNV1A64, 5);
  out.writeUInt16LE(0, 6);
  out.writeUInt32LE(sorted.length, 8);
  sorted.forEach((hash, index) => {
    out.writeBigUInt64LE(hash, HEADER_BYTES + index * 8);
  });
  return out;
}

export interface CompiledHeader {
  version: number;
  hashId: number;
  count: number;
}

export function readHeader(buffer: Buffer): CompiledHeader {
  if (buffer.length < HEADER_BYTES) throw new Error('compiled blocklist is truncated');
  if (buffer.readUInt32LE(0) !== MAGIC) throw new Error('not a compiled blocklist');
  return {
    version: buffer.readUInt8(4),
    hashId: buffer.readUInt8(5),
    count: buffer.readUInt32LE(8),
  };
}

/**
 * Reference lookup, matching what a client must do.
 *
 * Exists so the test suite can prove the artifact answers the same way the
 * resolver's own matcher does — a client written from the format comment above
 * should behave identically.
 */
export function lookupCompiled(buffer: Buffer, name: string): boolean {
  const { count } = readHeader(buffer);
  const labels = name.replace(/\.+$/, '').toLowerCase().split('.');

  for (let i = 0; i < labels.length; i += 1) {
    if (contains(buffer, count, hashDomain(labels.slice(i).join('.')))) return true;
  }
  return false;
}

function contains(buffer: Buffer, count: number, needle: bigint): boolean {
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = buffer.readBigUInt64LE(HEADER_BYTES + mid * 8);
    if (value === needle) return true;
    if (value < needle) low = mid + 1;
    else high = mid - 1;
  }
  return false;
}
