import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * PIN hashing.
 *
 * scrypt from `node:crypto` rather than bcrypt or argon2: a 4-digit PIN has 10k
 * possible values, so the work factor is the only thing standing between a
 * database dump and every PIN in it, and adding a native build dependency to get
 * that work factor is a bad trade when the standard library already has a
 * memory-hard KDF.
 *
 * The salt is per-PIN and travels inside the stored string, so no second column
 * is needed and the parameters can be raised later without invalidating existing
 * hashes -- `verify` reads them back from the hash it is checking.
 */

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt's default maxmem (32 MiB) is too small for N=16384,r=8 with headroom.
const MAX_MEM = 64 * 1024 * 1024;

@Injectable()
export class PinService {
  /** `scrypt$N$r$p$saltHex$keyHex`. Stored in `Protection.pinHash`, never returned. */
  async hash(pin: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await scrypt(pin, salt, KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEM,
    });
    return [
      'scrypt',
      SCRYPT_N,
      SCRYPT_R,
      SCRYPT_P,
      salt.toString('hex'),
      key.toString('hex'),
    ].join('$');
  }

  /**
   * Constant-time comparison. A length mismatch is answered `false` without a
   * comparison, because `timingSafeEqual` throws on unequal lengths -- and a
   * stored hash of the wrong length is corrupt, not a wrong PIN.
   */
  async verify(pin: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    let salt: Buffer;
    let expected: Buffer;
    try {
      salt = Buffer.from(parts[4], 'hex');
      expected = Buffer.from(parts[5], 'hex');
    } catch {
      return false;
    }
    if (salt.length === 0 || expected.length === 0) return false;

    const actual = await scrypt(pin, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  }
}
