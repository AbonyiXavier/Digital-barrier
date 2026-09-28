import { Module } from '@nestjs/common';

import { ConfigModule } from '../config';
import { OutboxModule } from '../outbox';
import { PrismaModule } from '../prisma';
import { PinGrantService } from './pin-grant.service';
import { PinService } from './pin.service';
import { ProtectionController } from './protection.controller';
import { ProtectionService } from './protection.service';

/**
 * Protection, the protection lock, and accountability.
 *
 * `ProtectionService` is exported so other modules can read state, but the
 * *effects* of an approved request are applied in `requests` against the same
 * columns: pulling them through this service would make the two modules mutually
 * dependent for no gain.
 */
@Module({
  imports: [ConfigModule, PrismaModule, OutboxModule],
  controllers: [ProtectionController],
  providers: [ProtectionService, PinService, PinGrantService],
  exports: [ProtectionService],
})
export class ProtectionModule {}
