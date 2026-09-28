import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue, type Job } from 'bullmq';

import { QUEUE } from './queue-names';

/**
 * The dead-letter queue.
 *
 * BullMQ has no native DLQ: a job that exhausts its attempts simply sits in the
 * failed set until it is trimmed away. That is the failure mode where a
 * notification silently never arrives, so exhausted jobs are copied here with
 * their error and original payload intact, and an operator can inspect or replay
 * them.
 */
@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(@InjectQueue(QUEUE.DEAD_LETTER) private readonly dlq: Queue) {}

  /** True when this failure was the job's last attempt. */
  isExhausted(job: Job): boolean {
    const allowed = job.opts.attempts ?? 1;
    return job.attemptsMade >= allowed;
  }

  async record(queue: string, job: Job, error: Error): Promise<void> {
    await this.dlq.add(
      `${queue}:${job.name}`,
      {
        queue,
        jobId: job.id,
        jobName: job.name,
        data: job.data,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
        error: { message: error.message, stack: error.stack },
      },
      { removeOnComplete: false, removeOnFail: false },
    );
    this.logger.error(
      `dead-lettered ${queue}:${job.name} (job ${job.id}) after ${job.attemptsMade} attempts: ${error.message}`,
    );
  }

  /** Called from a worker's `failed` handler; no-ops until attempts run out. */
  async handleFailure(queue: string, job: Job | undefined, error: Error): Promise<void> {
    if (!job) return;
    if (!this.isExhausted(job)) {
      this.logger.warn(
        `${queue}:${job.name} attempt ${job.attemptsMade} failed, will retry: ${error.message}`,
      );
      return;
    }
    await this.record(queue, job, error);
  }
}
