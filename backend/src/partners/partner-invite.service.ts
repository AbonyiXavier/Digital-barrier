/**
 * The partner's side of an invitation.
 *
 * Kept apart from `PartnersService` on purpose. Everything reachable from here is
 * unauthenticated — whoever holds the link is the caller — so the queries in this
 * file are written with an explicit `select` and never reach for a user's devices,
 * rules, counts or email. The product's promise is that a partner sees "a request
 * to turn protection off, and the reason you wrote with it", and the cheapest way
 * to keep that promise is for the code that answers partners to be physically
 * unable to read anything else.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { toPartnerStatusId } from '../users/api-mappers';
import { PrismaService } from '../prisma';
import type { PartnerStatus } from '../../generated/prisma/client';
import { InvitationContextDto, InvitationResponseDto } from './dto/invitation.dto';
import { PartnerTokenService } from './partner-token.service';

/**
 * The only columns any partner-facing query may read, written once so there is a
 * single place to audit. `user` is narrowed to `name`: not the email, not the
 * relations. Adding anything to this object is a privacy decision, and looks like
 * one in a diff.
 */
const INVITE_VIEW = {
  id: true,
  name: true,
  relationship: true,
  status: true,
  inviteExpiresAt: true,
  user: { select: { name: true } },
} as const;

@Injectable()
export class PartnerInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: PartnerTokenService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * What the invitation page shows. An unknown, used or expired link is not an
   * error: the page has something to say about it ("this link has expired"), so it
   * answers 200 with `valid: false` and nothing else.
   */
  async context(token: string): Promise<InvitationContextDto> {
    const claims = await this.tokens.verify(token);
    if (!claims) return { valid: false };

    const partner = await this.prisma.partner.findUnique({
      where: { id: claims.partnerId },
      select: INVITE_VIEW,
    });
    if (!partner) return { valid: false };

    return {
      valid: true,
      inviterName: partner.user.name,
      partnerName: partner.name,
      relationship: partner.relationship,
      status: toPartnerStatusId(partner.status),
      ...(partner.inviteExpiresAt ? { expiresAt: partner.inviteExpiresAt } : {}),
    };
  }

  /** "Yes, I'll do this." */
  async accept(token: string): Promise<InvitationResponseDto> {
    return this.respond(token, 'ACTIVE');
  }

  /** "No." Recorded, not hidden: the user is told, and can invite someone else. */
  async decline(token: string): Promise<InvitationResponseDto> {
    return this.respond(token, 'DECLINED');
  }

  private async respond(token: string, status: PartnerStatus): Promise<InvitationResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const claims = await this.tokens.verify(token, tx);
      if (!claims) throw invalidLink();

      const partner = await tx.partner.findUnique({
        where: { id: claims.partnerId },
        select: INVITE_VIEW,
      });
      if (!partner) throw invalidLink();

      /**
       * Only a PENDING partner is answering an *invitation*. An ACTIVE partner
       * also holds valid tokens — the ones minted for disable requests — and
       * letting those tokens land here would let a partner answering a request
       * accidentally re-decide their own membership, and would consume the token
       * the request is waiting on.
       */
      if (partner.status !== 'PENDING') {
        throw new ConflictException({
          code: 'INVITE_ALREADY_ANSWERED',
          message: 'This invitation has already been answered.',
        });
      }

      // Conditional on the status so two clicks in flight at once cannot both
      // win: Postgres re-checks the qualification after waiting for the row lock,
      // so the second one sees a row that is no longer PENDING and matches nothing.
      const answered = await tx.partner.updateMany({
        where: { id: partner.id, status: 'PENDING' },
        data: { status, respondedAt: new Date() },
      });
      if (answered.count === 0) {
        throw new ConflictException({
          code: 'INVITE_ALREADY_ANSWERED',
          message: 'This invitation has already been answered.',
        });
      }

      // Single use: the link in their mailbox stops working here.
      await this.tokens.consume(partner.id, tx);

      await this.outbox.emit(tx, {
        aggregateType: 'partner',
        aggregateId: partner.id,
        eventType: OUTBOX_EVENT.PARTNER_RESPONDED,
        payload: { partnerId: partner.id, userId: claims.userId, status },
      });

      return {
        status: toPartnerStatusId(status),
        inviterName: partner.user.name,
        partnerName: partner.name,
      };
    });
  }
}

function invalidLink(): NotFoundException {
  return new NotFoundException({
    code: 'INVITE_INVALID',
    message: 'This link is no longer valid. Ask for a new one.',
  });
}
