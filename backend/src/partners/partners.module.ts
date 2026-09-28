import { Module } from '@nestjs/common';

import { AppConfigService } from '../config';
import { OutboxModule } from '../outbox';
import { PartnerInviteController } from './partner-invite.controller';
import { PartnerInviteService } from './partner-invite.service';
import { PartnerTokenService } from './partner-token.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/**
 * Partner identity: who is looped in, and how they are reached.
 *
 * `PartnerTokenService` is exported because the disable-request state machine
 * lives in another module and sends its own links to the same partners through the
 * same mechanism. Tokens are minted and checked in exactly one place.
 */
@Module({
  imports: [OutboxModule],
  controllers: [PartnersController, PartnerInviteController],
  providers: [AppConfigService, PartnerTokenService, PartnersService, PartnerInviteService],
  exports: [PartnerTokenService],
})
export class PartnersModule {}
