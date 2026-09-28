import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RequestMethod, RequestStatus } from '../../generated/prisma/client';
import { OUTBOX_EVENT, OutboxService } from '../outbox';
import { PrismaService } from '../prisma';
import { intentToClient } from './request-codes';

/** A cap per tick, so a long outage cannot turn one run into an unbounded job. */
const BATCH = 200;

/**
 * Lapsing partner requests.
 *
 * `declined` and `expired` have no producer in the client -- nothing on a device
 * can put a request into either state, so if this job does not run, a request the
 * partner ignored stays PENDING forever and, because of
 * `one_pending_request_per_user`, the user can never raise another. That is the
 * failure mode this exists to prevent.
 *
 * An expired request approves nothing. Protection state is untouched: the ask
 * simply lapses, which is the safe default for a barrier -- silence is not consent.
 */
@Injectable()
export class RequestExpiryService {
  private readonly logger = new Logger(RequestExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'expire-partner-requests' })
  async sweep(): Promise<void> {
    try {
      const expired = await this.expireDue();
      if (expired > 0) this.logger.log(`expired ${expired} partner request(s)`);
    } catch (error) {
      // A cron throw is an unhandled rejection; the next tick retries in a minute.
      this.logger.error(
        `partner request sweep failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** Separated from the schedule so a test, or an operator, can run it directly. */
  async expireDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.disableRequest.findMany({
      where: {
        status: RequestStatus.PENDING,
        method: RequestMethod.PARTNER,
        expiresAt: { lte: now },
      },
      orderBy: { expiresAt: 'asc' },
      take: BATCH,
      select: { id: true, userId: true, partnerId: true, intent: true, expiresAt: true },
    });

    let count = 0;
    for (const row of due) {
      // One transaction per request: a single bad row cannot strand the batch, and
      // the guarded update means a partner who answered in the same second wins.
      const done = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.disableRequest.updateMany({
          where: { id: row.id, status: RequestStatus.PENDING },
          data: { status: RequestStatus.EXPIRED },
        });
        if (claimed.count === 0) return false;

        await this.outbox.emit(tx, {
          aggregateType: 'request',
          aggregateId: row.id,
          eventType: OUTBOX_EVENT.REQUEST_EXPIRED,
          payload: {
            requestId: row.id,
            userId: row.userId,
            partnerId: row.partnerId,
            intent: intentToClient(row.intent),
            expiresAt: row.expiresAt?.toISOString() ?? null,
          },
        });
        return true;
      });
      if (done) count += 1;
    }
    return count;
  }
}
