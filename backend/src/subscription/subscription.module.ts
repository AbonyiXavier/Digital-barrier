import { Module } from '@nestjs/common';

import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

/**
 * Plan state and the plan table. `SubscriptionService` is exported for the
 * settings module's premium gate, so "is this account premium" is answered in
 * one place.
 */
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
