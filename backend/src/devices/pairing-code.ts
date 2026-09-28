/**
 * Pairing codes.
 *
 * The alphabet is the prototype's (`mobile/src/app/devices/add.tsx`): people read
 * these aloud, so I, O, 0 and 1 are left out. What changes is who makes them —
 * the prototype minted a code on the phone and never checked it again, which made
 * the whole ceremony decorative. Here the server issues it, owns it, expires it
 * and consumes it exactly once.
 */

import { randomInt } from 'node:crypto';

/** Ambiguous characters are left out — people read this code aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export const PAIRING_CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Ten minutes: long enough to walk to the other machine, short enough to matter. */
export const CODE_TTL_MS = 10 * 60_000;

/**
 * `randomInt` rather than `Math.random`: 32^6 is only a billion, and a predictable
 * code is a device someone else can attach to your account.
 */
export function generatePairingCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Codes are read off a screen, so accept sloppy casing and spacing. */
export function normalisePairingCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}
