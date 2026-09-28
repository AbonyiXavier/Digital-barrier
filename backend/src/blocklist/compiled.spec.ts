/**
 * The compiled blocklist format is a contract between this server and three
 * client implementations that do not exist yet (Swift, Kotlin, and the existing
 * TypeScript resolver). These tests pin the bytes, so a client written from the
 * format comment can be checked against them — and so a change here that would
 * silently break a shipped app fails in CI instead.
 */
import {
  FORMAT_VERSION,
  HASH_FNV1A64,
  HEADER_BYTES,
  compile,
  hashDomain,
  lookupCompiled,
  readHeader,
} from './compiled';

describe('hashDomain', () => {
  it('matches the published FNV-1a 64 test vectors', () => {
    // From the FNV reference: these let a client verify its own hash before
    // trusting anything else in the format.
    expect(hashDomain('')).toBe(0xcbf2_9ce4_8422_2325n);
    expect(hashDomain('a')).toBe(0xaf63_dc4c_8601_ec8cn);
    expect(hashDomain('foobar')).toBe(0x85944171f73967e8n);
  });

  it('is case sensitive, so callers must normalise first', () => {
    // Deliberate: normalisation is one shared step (lowercase, strip trailing
    // dot) and folding it into the hash would hide it from clients.
    expect(hashDomain('Example.com')).not.toBe(hashDomain('example.com'));
  });
});

describe('compile', () => {
  it('writes the documented header', () => {
    const buffer = compile(['example.com']);
    const header = readHeader(buffer);
    expect(header.version).toBe(FORMAT_VERSION);
    expect(header.hashId).toBe(HASH_FNV1A64);
    expect(header.count).toBe(1);
    expect(buffer.length).toBe(HEADER_BYTES + 8);
  });

  it('deduplicates and sorts ascending', () => {
    const buffer = compile(['b.test', 'a.test', 'b.test', 'c.test']);
    expect(readHeader(buffer).count).toBe(3);

    const hashes: bigint[] = [];
    for (let i = 0; i < 3; i += 1) hashes.push(buffer.readBigUInt64LE(HEADER_BYTES + i * 8));
    // Sorted order is what makes a client's binary search valid.
    expect([...hashes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual(hashes);
  });

  it('is deterministic — same input, same bytes', () => {
    // Required for the ETag to mean anything.
    const a = compile(['x.test', 'y.test']);
    const b = compile(['y.test', 'x.test']);
    expect(a.equals(b)).toBe(true);
  });

  it('handles an empty list without a malformed header', () => {
    const buffer = compile([]);
    expect(readHeader(buffer).count).toBe(0);
    expect(buffer.length).toBe(HEADER_BYTES);
  });

  it('scales as 12 + 8n bytes', () => {
    const domains = Array.from({ length: 1_000 }, (_, i) => `d${i}.test`);
    expect(compile(domains).length).toBe(HEADER_BYTES + 1_000 * 8);
  });
});

describe('readHeader', () => {
  it('refuses a payload that is not one of ours', () => {
    expect(() => readHeader(Buffer.from('not a blocklist at all'))).toThrow(/not a compiled/);
  });

  it('refuses a truncated payload', () => {
    expect(() => readHeader(compile(['a.test']).subarray(0, 6))).toThrow(/truncated/);
  });
});

describe('lookupCompiled', () => {
  const buffer = compile(['pornhub.com', 'xvideos.com', 'example-adult-site.test']);

  it('matches the domain itself', () => {
    expect(lookupCompiled(buffer, 'pornhub.com')).toBe(true);
  });

  it('matches every subdomain, because the rule walks labels', () => {
    expect(lookupCompiled(buffer, 'www.pornhub.com')).toBe(true);
    expect(lookupCompiled(buffer, 'media.cdn.pornhub.com')).toBe(true);
  });

  it('never matches a lookalike', () => {
    // The classic way a naive blocker starts eating unrelated sites.
    expect(lookupCompiled(buffer, 'notpornhub.com')).toBe(false);
    expect(lookupCompiled(buffer, 'pornhub.com.evil.test')).toBe(false);
  });

  it('leaves unrelated domains alone', () => {
    expect(lookupCompiled(buffer, 'github.com')).toBe(false);
    expect(lookupCompiled(buffer, 'bbc.com')).toBe(false);
  });

  it('folds case and a trailing dot, as a resolver sees them', () => {
    expect(lookupCompiled(buffer, 'PoRnHuB.CoM')).toBe(true);
    expect(lookupCompiled(buffer, 'pornhub.com.')).toBe(true);
  });

  it('answers correctly at realistic scale', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => `blocked-${i}.test`);
    const big = compile([...many, 'needle.test']);
    expect(lookupCompiled(big, 'needle.test')).toBe(true);
    expect(lookupCompiled(big, 'deep.sub.needle.test')).toBe(true);
    expect(lookupCompiled(big, 'haystack.test')).toBe(false);
  });
});
