/**
 * Partner magic links.
 *
 * A partner never gets an account. Asking someone to create a password so they
 * can say "no" twice a year is how accountability features die, so the entire
 * partner surface is reached through one unguessable link per partner.
 *
 * Three properties make that defensible:
 *   - 32 random bytes (256 bits) from the CSPRNG, base64url so it survives being
 *     pasted out of an email client.
 *   - Only the SHA-256 of the token is stored. A database dump does not hand
 *     anyone the ability to approve a disable request. Hashing is unsalted and
 *     un-stretched on purpose: the input is 256 bits of entropy, so there is no
 *     dictionary to run and a slow KDF would only slow down the legitimate
 *     lookup.
 *   - Single use. `consume` clears the stored hash, so the link a partner clicks
 *     cannot be replayed from their mailbox, or from anyone else's.
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AppConfigService } from '../config';
import { PrismaService } from '../prisma';
import type { Prisma } from '../../generated/prisma/client';

/** What a valid token identifies: one partner, and the user who invited them. */
export interface PartnerTokenClaims {
  partnerId: string;
  userId: string;
}

/** 256 bits. */
const TOKEN_BYTES = 32;

/**
 * How long a link stays usable.
 *
 * Long enough that an invitation sent on a Friday still works on Monday, short
 * enough that a link sitting in an abandoned inbox eventually stops being a
 * credential. `POST /partners/:id/resend` mints a fresh one when it lapses.
 */
const INVITE_TTL_HOURS = 24 * 7;

function sha256(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

@Injectable()
export class PartnerTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Issues a token, stores only its hash on the partner row, returns the raw
   * token and the link. The raw token is returned exactly once and never again —
   * it goes into the outbox payload that becomes the partner's email.
   *
   * Takes an optional transaction client so the caller can commit the token
   * together with whatever prompted it. `issue(partnerId)` on its own behaves
   * identically, in its own implicit transaction.
   */
  async issue(
    partnerId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    await (tx ?? this.prisma).partner.update({
      where: { id: partnerId },
      data: { inviteTokenHash: sha256(token), inviteExpiresAt: expiresAt },
    });

    return { token, url: `${this.config.partnerWebUrl}/${token}`, expiresAt };
  }

  /**
   * Resolves a raw token to its partner, or null if unknown or expired. Does not
   * consume it, so a partner can open the page, read the request and answer it
   * without the link dying between the GET and the POST.
   */
  async verify(token: string, tx?: Prisma.TransactionClient): Promise<PartnerTokenClaims | null> {
    if (token === '') return null;
    const hash = sha256(token);

    const partner = await (tx ?? this.prisma).partner.findUnique({
      where: { inviteTokenHash: hash },
      select: { id: true, userId: true, inviteTokenHash: true, inviteExpiresAt: true },
    });
    if (!partner?.inviteTokenHash) return null;

    // The unique-index lookup already decided this, so the constant-time compare
    // is belt and braces — but it keeps the guarantee local to this method
    // instead of resting on an index definition in another file.
    if (!equalsInConstantTime(partner.inviteTokenHash, hash)) return null;

    if (!partner.inviteExpiresAt || partner.inviteExpiresAt.getTime() <= Date.now()) return null;

    return { partnerId: partner.id, userId: partner.userId };
  }

  /**
   * Invalidates the token by clearing the stored hash. Idempotent: consuming an
   * already-consumed partner is a no-op rather than an error, because the caller
   * that just answered a request should not fail on a retry.
   */
  async consume(partnerId: string, tx?: Prisma.TransactionClient): Promise<void> {
    await (tx ?? this.prisma).partner.update({
      where: { id: partnerId },
      data: { inviteTokenHash: null, inviteExpiresAt: null },
    });
  }
}

function equalsInConstantTime(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be a signal.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
