import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { toPartnerStatusId } from '../users/api-mappers';
import { PrismaService } from '../prisma';
import { Prisma, type Partner } from '../../generated/prisma/client';
import type { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnerDto, RemovePartnerResultDto } from './dto/partner.dto';
import { PartnerTokenService } from './partner-token.service';

/**
 * The order the accountability screen renders partners in: the person who can
 * actually unlock things, then the ones who have agreed to, then the ones who
 * have not answered, then the ones who said no. It is a presentation decision, so
 * it is applied in one place here rather than being re-derived by each client.
 */
const STATUS_ORDER: Record<'active' | 'pending' | 'declined', number> = {
  active: 1,
  pending: 2,
  declined: 3,
};
const APPROVER_ORDER = 0;

/**
 * Initials for the avatar: the first letter of each of the first two
 * whitespace-separated words, uppercased.
 *
 * Computed rather than stored. It is a pure function of the name, and a column
 * would be one more thing to forget to update when the name is edited.
 * `Array.from` rather than `[0]` so a name starting outside the BMP yields a
 * character instead of half a surrogate pair.
 */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? '').toUpperCase())
    .join('');
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: PartnerTokenService,
    private readonly outbox: OutboxService,
  ) {}

  /** Every partner of one user, in the order the app displays them. */
  async list(userId: string): Promise<PartnerDto[]> {
    const [protection, partners] = await Promise.all([
      this.prisma.protection.findUnique({ where: { userId }, select: { partnerId: true } }),
      // Oldest first, which is the order they were added in; the sort below only
      // reorders between groups, so within a group insertion order survives.
      this.prisma.partner.findMany({ where: { userId }, orderBy: { invitedAt: 'asc' } }),
    ]);

    const approverId = protection?.partnerId ?? null;

    return partners
      .map((partner) => this.toDto(partner, approverId))
      .sort((a, b) => this.rank(a) - this.rank(b));
  }

  /**
   * Invites a partner.
   *
   * One transaction covers four things that must not come apart: the partner row,
   * accountability being switched on, the token that makes the link work, and the
   * outbox event that becomes the email. A partner row with no token is an
   * invitation nobody can accept; an email with no partner row is a link to
   * nothing.
   *
   * Switching `accountabilityOn` on here is a rule taken from the prototype:
   * inviting someone *is* the act of turning accountability on, so making the
   * user then find a separate toggle would be a paperwork step that teaches them
   * the feature is off when they think it is on.
   */
  async invite(userId: string, dto: CreatePartnerDto): Promise<PartnerDto> {
    // A retried create must not produce a second partner and a second email.
    const existing = await this.findByClientRef(userId, dto.clientRef);
    if (existing) return existing;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const partner = await tx.partner.create({
          data: {
            userId,
            name: dto.name,
            relationship: dto.relationship,
            email: dto.email,
            status: 'PENDING',
            clientRef: dto.clientRef ?? null,
          },
        });

        // Upsert rather than update: the signup hook creates this row, but an
        // account that predates the hook must not get a 404 out of an invite.
        const protection = await tx.protection.upsert({
          where: { userId },
          create: { userId, accountabilityOn: true },
          update: { accountabilityOn: true },
        });

        const { url, expiresAt } = await this.tokens.issue(partner.id, tx);

        await this.outbox.emit(tx, {
          aggregateType: 'partner',
          aggregateId: partner.id,
          eventType: OUTBOX_EVENT.PARTNER_INVITED,
          // The link is the payload's whole point: the notification worker cannot
          // re-derive it, because only the hash was kept.
          payload: { partnerId: partner.id, userId, name: partner.name, email: partner.email, url },
        });

        return this.toDto({ ...partner, inviteExpiresAt: expiresAt }, protection.partnerId);
      });
    } catch (error) {
      // Two concurrent retries of the same optimistic create: the loser reads the
      // winner's row instead of reporting a conflict the client cannot act on.
      if (isUniqueViolation(error)) {
        const raced = await this.findByClientRef(userId, dto.clientRef);
        if (raced) return raced;
      }
      throw error;
    }
  }

  /**
   * Removes a partner.
   *
   * If they were the level-4 approver, `Protection.partnerId` is cleared in the
   * same transaction — but `lockLevel` is left at 4. "Level 4 with no approver" is
   * a state the schema models on purpose and the UI flags; silently dropping to
   * level 3 here would turn "remove a person" into "weaken the lock", which is
   * precisely the move the lock exists to prevent.
   */
  async remove(userId: string, partnerId: string): Promise<RemovePartnerResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findFirst({
        where: { id: partnerId, userId },
        select: { id: true },
      });
      if (!partner) throw notFound();

      const cleared = await tx.protection.updateMany({
        where: { userId, partnerId },
        data: { partnerId: null },
      });

      await tx.partner.delete({ where: { id: partner.id } });

      return { id: partner.id, removed: true, approverCleared: cleared.count > 0 };
    });
  }

  /**
   * Reissues the invitation link and emits the email again.
   *
   * PENDING only. An ACTIVE partner already holds tokens issued for disable
   * requests, and re-minting one here would silently invalidate a request they
   * are in the middle of answering; a DECLINED partner said no, and re-inviting
   * them is a new invitation, not a resend.
   */
  async resend(userId: string, partnerId: string): Promise<PartnerDto> {
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.findFirst({ where: { id: partnerId, userId } });
      if (!partner) throw notFound();
      if (partner.status !== 'PENDING') {
        throw new ConflictException({
          code: 'PARTNER_NOT_PENDING',
          message: 'This partner has already answered their invitation.',
        });
      }

      const { url, expiresAt } = await this.tokens.issue(partner.id, tx);

      await this.outbox.emit(tx, {
        aggregateType: 'partner',
        aggregateId: partner.id,
        eventType: OUTBOX_EVENT.PARTNER_INVITED,
        payload: { partnerId: partner.id, userId, name: partner.name, email: partner.email, url },
      });

      const protection = await tx.protection.findUnique({
        where: { userId },
        select: { partnerId: true },
      });

      return this.toDto({ ...partner, inviteExpiresAt: expiresAt }, protection?.partnerId ?? null);
    });
  }

  private async findByClientRef(
    userId: string,
    clientRef: string | undefined,
  ): Promise<PartnerDto | null> {
    if (clientRef === undefined) return null;
    const [partner, protection] = await Promise.all([
      this.prisma.partner.findUnique({ where: { userId_clientRef: { userId, clientRef } } }),
      this.prisma.protection.findUnique({ where: { userId }, select: { partnerId: true } }),
    ]);
    return partner ? this.toDto(partner, protection?.partnerId ?? null) : null;
  }

  private toDto(partner: Partner, approverId: string | null): PartnerDto {
    return {
      id: partner.id,
      name: partner.name,
      relationship: partner.relationship,
      email: partner.email,
      status: toPartnerStatusId(partner.status),
      initials: initialsFor(partner.name),
      isApprover: approverId === partner.id,
      invitedAt: partner.invitedAt,
      respondedAt: partner.respondedAt,
      inviteExpiresAt: partner.inviteExpiresAt,
      clientRef: partner.clientRef,
    };
  }

  private rank(partner: PartnerDto): number {
    return partner.isApprover ? APPROVER_ORDER : STATUS_ORDER[partner.status];
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: 'PARTNER_NOT_FOUND',
    message: 'No such partner.',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
