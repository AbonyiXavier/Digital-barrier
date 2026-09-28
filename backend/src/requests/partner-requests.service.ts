import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { RequestMethod, RequestStatus } from '../../generated/prisma/client';
import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { PartnerTokenService } from '../partners';
import { PrismaService } from '../prisma';
import { applyApprovalEffect, type ApprovalEffect } from './request-effects';
import { intentToClient } from './request-codes';
import type { PartnerDecisionView, PartnerRequestView } from './request.view';

/**
 * The partner's side of a level 4 lock. No session, no account, no password --
 * one unguessable link, verified by `PartnerTokenService`.
 *
 * The narrow surface is the product promise, not an oversight: a partner sees the
 * reason, when it was raised, when it lapses, and who is asking. There is no
 * endpoint here that could return a domain, a device, or a history, because
 * "share activity detail" is described in the app as a guarantee rather than a
 * setting.
 */
@Injectable()
export class PartnerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly tokens: PartnerTokenService,
  ) {}

  async view(token: string): Promise<PartnerRequestView> {
    const claims = await this.claims(token);
    const now = new Date();

    const row = await this.prisma.disableRequest.findFirst({
      where: {
        userId: claims.userId,
        partnerId: claims.partnerId,
        status: RequestStatus.PENDING,
        method: RequestMethod.PARTNER,
        expiresAt: { gt: now },
      },
      orderBy: { requestedAt: 'desc' },
      // The select *is* the privacy boundary. Adding a field here is a product
      // decision, not a refactor.
      select: {
        reason: true,
        requestedAt: true,
        expiresAt: true,
        user: { select: { name: true } },
      },
    });

    if (row === null || row.expiresAt === null) throw this.noPendingRequest();

    return {
      requesterName: row.user.name,
      reason: row.reason,
      requestedAt: row.requestedAt,
      expiresAt: row.expiresAt,
    };
  }

  async approve(token: string): Promise<PartnerDecisionView> {
    return this.decide(token, RequestStatus.APPROVED);
  }

  async decline(token: string): Promise<PartnerDecisionView> {
    return this.decide(token, RequestStatus.DECLINED);
  }

  private async decide(
    token: string,
    outcome: typeof RequestStatus.APPROVED | typeof RequestStatus.DECLINED,
  ): Promise<PartnerDecisionView> {
    const claims = await this.claims(token);
    const now = new Date();
    // The token itself is never stored. Its hash is, so a decision can be tied to
    // the link that made it without the link surviving in the database.
    const decidedVia = createHash('sha256').update(token, 'utf8').digest('hex');

    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.disableRequest.findFirst({
        where: {
          userId: claims.userId,
          partnerId: claims.partnerId,
          status: RequestStatus.PENDING,
          method: RequestMethod.PARTNER,
        },
        orderBy: { requestedAt: 'desc' },
        select: { id: true, expiresAt: true },
      });
      if (pending === null) throw this.noPendingRequest();

      // The sweep runs once a minute, so a request can be past its window and
      // still PENDING. Answering it must not work either way.
      if (pending.expiresAt !== null && pending.expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException({
          code: 'REQUEST_EXPIRED',
          message: 'This request has already lapsed.',
          details: { expiresAt: pending.expiresAt.toISOString() },
        });
      }

      const claimed = await tx.disableRequest.updateMany({
        where: { id: pending.id, status: RequestStatus.PENDING },
        data: { status: outcome, decidedAt: now, decidedVia },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: 'REQUEST_NOT_PENDING',
          message: 'This request has already been decided.',
        });
      }

      const row = await tx.disableRequest.findUniqueOrThrow({ where: { id: pending.id } });

      // Only approval touches protection. A decline changes the request and
      // nothing else.
      let effect: ApprovalEffect | null = null;
      if (outcome === RequestStatus.APPROVED) effect = await applyApprovalEffect(tx, row);

      await this.outbox.emit(tx, {
        aggregateType: 'request',
        aggregateId: row.id,
        eventType:
          outcome === RequestStatus.APPROVED
            ? OUTBOX_EVENT.REQUEST_APPROVED
            : OUTBOX_EVENT.REQUEST_DECLINED,
        payload: {
          requestId: row.id,
          userId: row.userId,
          partnerId: row.partnerId,
          method: row.method,
          intent: intentToClient(row.intent),
          effect,
          decidedBy: 'partner',
        },
      });

      // Single use, committed with the decision: the link in the partner's mailbox
      // stops being a credential the moment they have used it.
      await this.tokens.consume(claims.partnerId, tx);

      return {
        decision: outcome === RequestStatus.APPROVED ? 'approved' : 'declined',
        decidedAt: now,
      };
    });
  }

  /** 404 rather than 401: an invalid link should not confirm that a valid one exists. */
  private async claims(token: string): Promise<{ partnerId: string; userId: string }> {
    const claims = await this.tokens.verify(token);
    if (claims === null) {
      throw new NotFoundException({
        code: 'LINK_INVALID',
        message: 'This link is no longer valid.',
      });
    }
    return claims;
  }

  private noPendingRequest(): NotFoundException {
    return new NotFoundException({
      code: 'NO_PENDING_REQUEST',
      message: 'There is nothing waiting for you to answer.',
    });
  }
}
