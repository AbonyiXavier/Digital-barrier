import { Module } from '@nestjs/common';

import { FeedsModule } from '../feeds/feeds.module';
import { BlocklistController } from './blocklist.controller';
import { CompiledBlocklistService } from './compiled.service';
import { BlocklistService } from './blocklist.service';

/**
 * Imports FeedsModule for the published domain set: a policy decision is the
 * user's rules laid over the feeds, and the feeds are the feeds module's business.
 */
@Module({
  imports: [FeedsModule],
  controllers: [BlocklistController],
  providers: [BlocklistService, CompiledBlocklistService],
  exports: [BlocklistService],
})
export class BlocklistModule {}
