import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma/client';
import type { OutboxEventInput } from './outbox.events';

/**
 * The write half of the transactional outbox.
 *
 * `emit` takes the *transaction client*, not the root Prisma service, and that is
 * the whole point: the event row and the domain change it describes commit or
 * roll back together. A notification can therefore never be sent for something
 * that did not happen, and something that happened can never silently fail to
 * notify.
 */
@Injectable()
export class OutboxService {
  async emit(tx: Prisma.TransactionClient, event: OutboxEventInput): Promise<void> {
    await tx.outbox.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
      },
    });
  }

  /** Several events from one transaction, in order. */
  async emitAll(
    tx: Prisma.TransactionClient,
    events: readonly OutboxEventInput[],
  ): Promise<void> {
    if (events.length === 0) return;
    await tx.outbox.createMany({
      data: events.map((event) => ({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload as Prisma.InputJsonValue,
      })),
    });
  }
}
