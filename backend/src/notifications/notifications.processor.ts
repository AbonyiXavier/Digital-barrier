import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { DeadLetterService, QUEUE } from '../queues';
import { NotificationsService, type OutboxJobData } from './notifications.service';

/**
 * Consumes relayed outbox events.
 *
 * The relay uses the outbox row id as the BullMQ job id, so a replayed relay
 * enqueues nothing new — but delivery is still at-least-once (the enqueue can
 * succeed and the mark-published fail), so the work here has to tolerate being
 * run twice for the same event.
 */
@Processor(QUEUE.NOTIFICATIONS)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly deadLetter: DeadLetterService,
  ) {
    super();
  }

  override async process(job: Job<OutboxJobData>): Promise<void> {
    await this.notifications.handle(job.data);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<OutboxJobData> | undefined, error: Error): Promise<void> {
    await this.deadLetter.handleFailure(QUEUE.NOTIFICATIONS, job, error);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<OutboxJobData>): void {
    this.logger.debug(`delivered ${job.data.eventType} (outbox ${job.data.outboxId})`);
  }
}
