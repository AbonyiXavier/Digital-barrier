import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

/**
 * Blocked-attempt counts. `MetricsService` is exported because two other
 * modules need the same seven-day window — the bootstrap response and the weekly
 * digest — and a second implementation of the orientation rule is exactly the
 * kind of duplication that ends up disagreeing.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
