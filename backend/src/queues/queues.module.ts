import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { AppConfigService, ConfigModule } from '../config';
import { DeadLetterService } from './dead-letter.service';
import { QUEUE } from './queue-names';

/**
 * Shared retry policy. Exponential backoff so a flapping upstream is not
 * hammered, and completed jobs are trimmed so Redis does not grow without bound
 * while failures are kept long enough to be seen.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 * 7 },
} as const;

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: config.redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
      extraProviders: [AppConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE.NOTIFICATIONS },
      { name: QUEUE.FEEDS },
      { name: QUEUE.MAINTENANCE },
      // The DLQ takes no retries: a job is here precisely because retrying failed.
      { name: QUEUE.DEAD_LETTER, defaultJobOptions: { attempts: 1 } },
    ),
  ],
  providers: [DeadLetterService],
  exports: [BullModule, DeadLetterService],
})
export class QueuesModule {}
