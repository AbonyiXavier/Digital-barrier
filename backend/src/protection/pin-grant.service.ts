import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { AppConfigService } from '../config';

/**
 * The hand-off from "this session proved it knows the PIN" to "this session may
 * turn protection off".
 *
 * The schema is frozen and `Protection` has no `pinVerifiedAt` column, so the
 * timestamp-on-the-row variant is not available without a migration. That is the
 * smaller loss: a column would make the grant *account*-wide, so a PIN typed on
 * one device would license a disable from another for as long as the window
 * lasted. A grant bound to the reply of one verify call cannot do that.
 *
 * So `POST /protection/pin/verify` returns a short-lived signed grant, and
 * `PUT /protection/enabled` will only accept `{ on: false }` at level 2 when it
 * is presented (body `grant`, or the `x-pin-grant` header). The grant is:
 *
 *   v1.<userIdB64>.<expiryMs>.<jti>.<hmacSha256>
 *
 * signed with BETTER_AUTH_SECRET, so it needs no storage to be verified, cannot
 * be minted by a client, and cannot be replayed for another user or past its
 * expiry. Single use is enforced on top of that by remembering spent jtis until
 * they expire -- in memory, which is honest about being per-process: the security
 * property that has to hold across instances is the signature and the 2-minute
 * expiry, and those are stateless.
 */

const GRANT_TTL_MS = 120_000;
const VERSION = 'v1';

export interface PinGrant {
  grant: string;
  expiresAt: Date;
}

@Injectable()
export class PinGrantService {
  private readonly logger = new Logger(PinGrantService.name);
  /** jti -> expiry (ms). Spent grants, kept only until they would expire anyway. */
  private readonly spent = new Map<string, number>();

  constructor(private readonly config: AppConfigService) {}

  issue(userId: string): PinGrant {
    const expiry = Date.now() + GRANT_TTL_MS;
    const jti = randomBytes(16).toString('base64url');
    const body = this.body(userId, expiry, jti);
    return {
      grant: `${body}.${this.sign(body)}`,
      expiresAt: new Date(expiry),
    };
  }

  /**
   * True when `grant` is a signature-valid, unexpired, unspent grant for
   * `userId`. Consuming is the same call as checking, so a caller cannot forget
   * to burn it.
   */
  consume(userId: string, grant: string | undefined): boolean {
    if (typeof grant !== 'string' || grant === '') return false;

    const cut = grant.lastIndexOf('.');
    if (cut <= 0) return false;
    const body = grant.slice(0, cut);
    const signature = grant.slice(cut + 1);

    if (!this.signatureMatches(body, signature)) return false;

    const [version, userB64, expiryRaw, jti] = body.split('.');
    if (version !== VERSION || !userB64 || !expiryRaw || !jti) return false;

    const expiry = Number(expiryRaw);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;

    // Signature already proved the user id was not tampered with; this only
    // checks the grant was minted for the caller.
    if (userB64 !== Buffer.from(userId, 'utf8').toString('base64url')) return false;

    if (this.spent.has(jti)) return false;
    this.spent.set(jti, expiry);
    return true;
  }

  /** Nothing here outlives its expiry, so the sweep is just bookkeeping. */
  @Interval(GRANT_TTL_MS)
  pruneSpent(): void {
    const now = Date.now();
    let removed = 0;
    for (const [jti, expiry] of this.spent) {
      if (expiry <= now) {
        this.spent.delete(jti);
        removed += 1;
      }
    }
    if (removed > 0) this.logger.debug(`pruned ${removed} spent pin grant(s)`);
  }

  private body(userId: string, expiry: number, jti: string): string {
    return [VERSION, Buffer.from(userId, 'utf8').toString('base64url'), expiry, jti].join('.');
  }

  private sign(body: string): string {
    return createHmac('sha256', `pin-grant:${this.config.authSecret}`)
      .update(body)
      .digest('base64url');
  }

  private signatureMatches(body: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(body), 'utf8');
    const actual = Buffer.from(signature, 'utf8');
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}
