import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUserId } from '../common';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { PartnerDto, RemovePartnerResultDto } from './dto/partner.dto';
import { PartnersService } from './partners.service';

/**
 * The user's own view of their accountability partners.
 *
 * Session-protected by the global `AuthGuard` the Better Auth integration
 * registers — no decorator needed, and no way to forget one.
 */
@ApiTags('partners')
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @ApiOperation({
    summary: 'List the current user’s partners.',
    description:
      'Ordered the way the accountability screen renders them: the level-4 approver ' +
      'first, then ACTIVE, PENDING, DECLINED. `initials` is computed from the name.',
  })
  @ApiOkResponse({ type: [PartnerDto] })
  list(@CurrentUserId() userId: string): Promise<PartnerDto[]> {
    return this.partners.list(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Invite a partner.',
    description:
      'Creates the partner as PENDING, switches accountability on, mints a single-use ' +
      'magic link and queues the invitation email — all in one transaction. ' +
      'Idempotent on `clientRef`: re-posting the same one returns the existing partner.',
  })
  @ApiOkResponse({ type: PartnerDto })
  invite(@CurrentUserId() userId: string, @Body() body: CreatePartnerDto): Promise<PartnerDto> {
    return this.partners.invite(userId, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a partner.',
    description:
      'If they were the level-4 approver, the approver is cleared and ' +
      '`approverCleared` says so. The lock level is deliberately left alone.',
  })
  @ApiOkResponse({ type: RemovePartnerResultDto })
  @ApiNotFoundResponse({ description: 'PARTNER_NOT_FOUND' })
  remove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<RemovePartnerResultDto> {
    return this.partners.remove(userId, id);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send the invitation again.',
    description: 'Mints a fresh link, invalidating the previous one. PENDING partners only.',
  })
  @ApiOkResponse({ type: PartnerDto })
  @ApiNotFoundResponse({ description: 'PARTNER_NOT_FOUND' })
  @ApiConflictResponse({ description: 'PARTNER_NOT_PENDING' })
  resend(@CurrentUserId() userId: string, @Param('id') id: string): Promise<PartnerDto> {
    return this.partners.resend(userId, id);
  }
}
