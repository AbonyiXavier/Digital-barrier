import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * The account, and the bootstrap endpoint the whole app hydrates from.
 *
 * `MetricsModule` is imported for the seven-day block window, so the counts in
 * the bootstrap response and the counts in `GET /metrics/blocks` come from one
 * implementation of the orientation rule rather than two.
 */
@Module({
  imports: [MetricsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
