import { Module } from '@nestjs/common';

import { ConfigModule } from '../config';
import { OutboxModule } from '../outbox';
import { PartnersModule } from '../partners';
import { PrismaModule } from '../prisma';
import { PartnerRequestsController } from './partner-requests.controller';
import { PartnerRequestsService } from './partner-requests.service';
import { RequestExpiryService } from './request-expiry.service';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

/**
 * Disable requests: the user's side under `/requests`, the partner's side under
 * `/p`, and the sweep that lapses partner requests nobody answered.
 *
 * `PartnersModule` is imported for `PartnerTokenService` only. The dependency runs
 * one way -- partners knows nothing about requests.
 */
@Module({
  imports: [ConfigModule, PrismaModule, OutboxModule, PartnersModule],
  controllers: [RequestsController, PartnerRequestsController],
  providers: [RequestsService, PartnerRequestsService, RequestExpiryService],
  exports: [RequestsService],
})
export class RequestsModule {}
