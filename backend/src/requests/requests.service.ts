import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PartnerStatus,
  Prisma,
  RequestIntent,
  RequestMethod,
  RequestStatus,
  type DisableRequest,
} from '../../generated/prisma/client';
import { AppConfigService } from '../config';
import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { PrismaService } from '../prisma';
import { ensureProtection, type Db } from '../protection/protection-row';
import type { CreateRequestDto, ListRequestsQueryDto } from './dto';
import { applyApprovalEffect } from './request-effects';
import {
  RESOLVED_STATUSES,
  STATUS_FILTER,
  intentToClient,
  intentToEnum,
  methodForLevel,
} from './request-codes';
import { toRequestView, type RequestView } from './request.view';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Disable requests -- the anti-tamper core.
 *
 * Only lock levels 3 and 4 create requests; 1 and 2 mutate directly through
 * `protection`. Both deadlines are computed here, from the server clock and the
 * server's copy of the waiting period, because the prototype computed them on the
 * device and stored them in AsyncStorage -- a countdown the locked-out party can
 * edit is not a countdown.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly config: AppConfigService,
  ) {}

  async create(userId: string, dto: CreateRequestDto): Promise<RequestView> {
    const intent = intentToEnum(dto.intent);

    // Mirrors `request_target_level_matches_intent`, so the mismatch is a 400 that
    // names the field instead of a 500 from Postgres.
    if (intent === RequestIntent.DISABLE && dto.targetLevel !== undefined) {
      throw new BadRequestException({
        code: 'TARGET_LEVEL_NOT_ALLOWED',
        message: "targetLevel is only meaningful when intent is 'lower-level'.",
      });
    }
    if (intent === RequestIntent.LOWER_LEVEL && dto.targetLevel === undefined) {
      throw new BadRequestException({
        code: 'TARGET_LEVEL_REQUIRED',
        message: "targetLevel is required when intent is 'lower-level'.",
      });
    }

    // A retried create must not raise a second request.
    if (dto.clientRef !== undefined) {
      const echoed = await this.byClientRef(userId, dto.clientRef);
      if (echoed !== null) return toRequestView(echoed);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const protection = await ensureProtection(tx, userId);

        const method = methodForLevel(protection.lockLevel);
        if (method === null) {
          throw new ConflictException({
            code: 'LOCK_ALLOWS_DIRECT_CHANGE',
            message:
              'There is nothing to request at this lock level. Change protection directly.',
            details: { lockLevel: protection.lockLevel, changeVia: 'PUT /protection/enabled' },
          });
        }

        const targetLevel = intent === RequestIntent.LOWER_LEVEL ? (dto.targetLevel ?? null) : null;
        if (targetLevel !== null && targetLevel >= protection.lockLevel) {
          throw new ConflictException({
            code: 'TARGET_LEVEL_NOT_LOWER',
            message: 'A lower-level request has to ask for a weaker lock than the current one.',
            details: { lockLevel: protection.lockLevel, targetLevel },
          });
        }

        const reason = (dto.reason ?? '').trim();
        // A partner is being asked to make a judgement, and cannot make one about
        // a blank. During a countdown there is nobody to read it, so it is optional.
        if (method === RequestMethod.PARTNER && reason === '') {
          throw new BadRequestException({
            code: 'REASON_REQUIRED',
            message: 'Tell your partner why. They see this, and nothing else.',
          });
        }

        const now = new Date();
        const deadlines = await this.deadlines(tx, userId, method, protection, now);

        // Belt to the partial unique index's braces: this gives the ordinary case a
        // named 409 instead of a translated constraint violation.
        const open = await tx.disableRequest.findFirst({
          where: { userId, status: RequestStatus.PENDING },
          select: { id: true },
        });
        if (open !== null) throw this.alreadyPending();

        const row = await tx.disableRequest.create({
          data: {
            userId,
            method,
            intent,
            targetLevel,
            reason,
            requestedAt: now,
            readyAt: deadlines.readyAt,
            expiresAt: deadlines.expiresAt,
            partnerId: deadlines.partnerId,
            clientRef: dto.clientRef ?? null,
          },
        });

        await this.outbox.emit(tx, {
          aggregateType: 'request',
          aggregateId: row.id,
          eventType: OUTBOX_EVENT.REQUEST_CREATED,
          payload: {
            requestId: row.id,
            userId,
            method: row.method,
            intent: intentToClient(row.intent),
            targetLevel: row.targetLevel,
            partnerId: row.partnerId,
            readyAt: row.readyAt?.toISOString() ?? null,
            expiresAt: row.expiresAt?.toISOString() ?? null,
          },
        });

        return toRequestView(row, now);
      });
    } catch (error) {
      return this.onCreateFailure(userId, dto, error);
    }
  }

  async list(userId: string, query: ListRequestsQueryDto): Promise<RequestView[]> {
    const rows = await this.prisma.disableRequest.findMany({
      where: { userId, ...this.statusWhere(query.status) },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
    });
    const now = new Date();
    return rows.map((row) => toRequestView(row, now));
  }

  /**
   * Cancelling is allowed at any time while pending, and is never gated by the
   * lock. Withdrawing a request only ever leaves the barrier where it was, so
   * making the user wait out a delay to take back an ask would be cruelty with no
   * security value. Sets CANCELLED; nothing else changes.
   */
  async cancel(userId: string, id: string): Promise<RequestView> {
    const row = await this.mine(userId, id);
    if (row.status !== RequestStatus.PENDING) throw this.notPending(row.status);

    const claimed = await this.prisma.disableRequest.updateMany({
      where: { id: row.id, status: RequestStatus.PENDING },
      data: { status: RequestStatus.CANCELLED },
    });
    if (claimed.count === 0) throw this.notPending(RequestStatus.PENDING);

    return toRequestView(await this.prisma.disableRequest.findUniqueOrThrow({ where: { id } }));
  }

  /**
   * The user approving their own request, which is only coherent for a DELAY: the
   * wait *is* the approval, and it is over. PARTNER requests are decided at `/p`
   * and never here -- otherwise level 4 would be level 3 with extra steps.
   */
  async approve(userId: string, id: string): Promise<RequestView> {
    const existing = await this.mine(userId, id);
    if (existing.status !== RequestStatus.PENDING) throw this.notPending(existing.status);
    if (existing.method !== RequestMethod.DELAY) {
      throw new ConflictException({
        code: 'PARTNER_APPROVAL_REQUIRED',
        message: 'Only your partner can approve this request.',
      });
    }

    const now = new Date();
    if (existing.readyAt === null || existing.readyAt.getTime() > now.getTime()) {
      throw new ConflictException({
        code: 'WAITING_PERIOD_NOT_ELAPSED',
        message: 'The waiting period has not finished yet.',
        details: { readyAt: existing.readyAt?.toISOString() ?? null },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-checking the deadline inside the guarded update closes the window
      // between the read above and the write: a row can only be claimed once, and
      // only after readyAt.
      const claimed = await tx.disableRequest.updateMany({
        where: {
          id: existing.id,
          status: RequestStatus.PENDING,
          method: RequestMethod.DELAY,
          readyAt: { lte: now },
        },
        data: { status: RequestStatus.APPROVED, decidedAt: now },
      });
      if (claimed.count === 0) throw this.notPending(RequestStatus.PENDING);

      const row = await tx.disableRequest.findUniqueOrThrow({ where: { id: existing.id } });
      const effect = await applyApprovalEffect(tx, row);

      await this.outbox.emit(tx, {
        aggregateType: 'request',
        aggregateId: row.id,
        eventType: OUTBOX_EVENT.REQUEST_APPROVED,
        payload: {
          requestId: row.id,
          userId,
          method: row.method,
          intent: intentToClient(row.intent),
          effect,
          decidedBy: 'delay',
        },
      });

      return toRequestView(row, now);
    });
  }

  // -- helpers ------------------------------------------------------------

  /**
   * The server owns both deadlines, and each method gets exactly one of them --
   * `request_deadline_matches_method` will reject anything else, which keeps the
   * overloaded "resolvesAt" of the prototype from creeping back in.
   */
  private async deadlines(
    db: Db,
    userId: string,
    method: RequestMethod,
    protection: { waitingPeriodMinutes: number; partnerId: string | null },
    now: Date,
  ): Promise<{ readyAt: Date | null; expiresAt: Date | null; partnerId: string | null }> {
    if (method === RequestMethod.DELAY) {
      return {
        readyAt: new Date(now.getTime() + protection.waitingPeriodMinutes * MS_PER_MINUTE),
        expiresAt: null,
        partnerId: null,
      };
    }
    return {
      readyAt: null,
      expiresAt: new Date(now.getTime() + this.config.partnerRequestWindowHours * MS_PER_HOUR),
      partnerId: await this.activeApproverId(db, userId, protection.partnerId),
    };
  }

  /**
   * Level 4 with no approver is a legal state on the protection row -- but a
   * request nobody can answer is not, so it is refused at the point where it would
   * be created rather than by forbidding the state.
   */
  private async activeApproverId(
    db: Db,
    userId: string,
    partnerId: string | null,
  ): Promise<string> {
    if (partnerId !== null) {
      const partner = await db.partner.findFirst({
        where: { id: partnerId, userId, status: PartnerStatus.ACTIVE },
        select: { id: true },
      });
      if (partner !== null) return partner.id;
    }
    throw new ConflictException({
      code: 'NO_ACTIVE_PARTNER',
      message:
        'Your partner lock has no active approver. Only a partner who has accepted ' +
        'their invitation can approve a request.',
    });
  }

  private statusWhere(
    status: ListRequestsQueryDto['status'],
  ): { status?: RequestStatus | { in: RequestStatus[] } } {
    if (status === STATUS_FILTER.PENDING) return { status: RequestStatus.PENDING };
    if (status === STATUS_FILTER.RESOLVED) return { status: { in: [...RESOLVED_STATUSES] } };
    return {};
  }

  private async mine(userId: string, id: string): Promise<DisableRequest> {
    const row = await this.prisma.disableRequest.findFirst({ where: { id, userId } });
    if (row === null) {
      throw new NotFoundException({
        code: 'REQUEST_NOT_FOUND',
        message: 'No such request on this account.',
      });
    }
    return row;
  }

  private async byClientRef(userId: string, clientRef: string): Promise<DisableRequest | null> {
    return this.prisma.disableRequest.findUnique({
      where: { userId_clientRef: { userId, clientRef } },
    });
  }

  private alreadyPending(): ConflictException {
    return new ConflictException({
      code: 'REQUEST_ALREADY_PENDING',
      message: 'You already have a request waiting. Cancel it before raising another.',
    });
  }

  private notPending(status: RequestStatus): ConflictException {
    return new ConflictException({
      code: 'REQUEST_NOT_PENDING',
      message: 'That request has already been decided.',
      details: { status },
    });
  }

  /**
   * `one_pending_request_per_user` is a partial unique index, so a race that gets
   * past the pre-check surfaces as P2002 rather than as a second row. The generic
   * handler would call that ALREADY_EXISTS, which tells a client nothing.
   */
  private async onCreateFailure(
    userId: string,
    dto: CreateRequestDto,
    error: unknown,
  ): Promise<RequestView> {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = this.targetOf(error);
      if (dto.clientRef !== undefined && target.includes('clientRef')) {
        const echoed = await this.byClientRef(userId, dto.clientRef);
        if (echoed !== null) return toRequestView(echoed);
      }
      throw this.alreadyPending();
    }
    throw error;
  }

  private targetOf(error: Prisma.PrismaClientKnownRequestError): string {
    const target = error.meta?.target;
    if (typeof target === 'string') return target;
    if (Array.isArray(target)) return target.join(',');
    return '';
  }
}
