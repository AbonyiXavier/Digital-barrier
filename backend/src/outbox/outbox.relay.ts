import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Queue } from 'bullmq';

import { PrismaService } from '../prisma';
import { QUEUE } from '../queues';

const BATCH_SIZE = 50;
const RELAY_INTERVAL_MS = 2_000;
/** After this many failed relay attempts, stop retrying and leave it for a human. */
const MAX_RELAY_ATTEMPTS = 10;

interface ClaimedRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

/**
 * The read half of the outbox: moves committed events onto the notifications
 * queue, then marks them published.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` so several API instances can run this
 * concurrently without ever handing the same event to two workers. Delivery is
 * at-least-once — the enqueue can succeed and the mark-published fail — so
 * consumers must be idempotent, which is why the job id is the outbox row id.
 */
@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.NOTIFICATIONS) private readonly notifications: Queue,
  ) {}

  @Interval(RELAY_INTERVAL_MS)
  async tick(): Promise<void> {
    // Overlapping ticks would double-claim within this process.
    if (this.running) return;
    this.running = true;
    try {
      let relayed = 0;
      // Keep going while full batches come back, so a burst drains promptly.
      for (;;) {
        const count = await this.relayBatch();
        relayed += count;
        if (count < BATCH_SIZE) break;
      }
      if (relayed > 0) this.logger.debug(`relayed ${relayed} outbox event(s)`);
    } catch (error) {
      this.logger.error(
        `outbox relay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async relayBatch(): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT "id", "eventType", "aggregateType", "aggregateId", "payload"
        FROM "outbox"
        WHERE "publishedAt" IS NULL AND "attempts" < ${MAX_RELAY_ATTEMPTS}
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length === 0) return 0;

      for (const row of rows) {
        try {
          await this.notifications.add(
            row.eventType,
            {
              outboxId: row.id,
              eventType: row.eventType,
              aggregateType: row.aggregateType,
              aggregateId: row.aggregateId,
              payload: row.payload,
            },
            // Row id as job id: a replayed relay enqueues nothing new.
            { jobId: row.id },
          );
          await tx.outbox.update({
            where: { id: row.id },
            data: { publishedAt: new Date(), lastError: null },
          });
        } catch (error) {
          await tx.outbox.update({
            where: { id: row.id },
            data: {
              attempts: { increment: 1 },
              lastError: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
      return rows.length;
    });
  }
}
