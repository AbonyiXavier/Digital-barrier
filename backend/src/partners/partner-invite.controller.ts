import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { InvitationContextDto, InvitationResponseDto } from './dto/invitation.dto';
import { PartnerInviteService } from './partner-invite.service';

/**
 * The partner's three endpoints. Partners never get an account, so these are the
 * only unauthenticated routes in the application that touch a user's data, and the
 * token in the path is the entire credential.
 *
 * Two consequences, both enforced here:
 *   - `@AllowAnonymous()` is at class level, so there is no route in this file that
 *     could accidentally be reached with a session and a wrong assumption about
 *     whose data it is.
 *   - A far tighter rate limit than the app-wide 120/min. The credential is in a
 *     URL and is therefore guessable in principle; ten attempts a minute makes
 *     brute force against 256 bits of entropy pointless rather than merely
 *     impractical.
 */
@ApiTags('partner-invites')
@AllowAnonymous()
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('p')
export class PartnerInviteController {
  constructor(private readonly invites: PartnerInviteService) {}

  @Get(':token/invite')
  @ApiOperation({
    summary: 'What this invitation is.',
    description:
      'The inviter’s name, the relationship they wrote, and whether the link still ' +
      'works. Never the inviter’s email, devices, rules or any activity — a partner ' +
      'sees a request and its reason, and nothing else.',
  })
  @ApiOkResponse({ type: InvitationContextDto })
  context(@Param('token') token: string): Promise<InvitationContextDto> {
    return this.invites.context(token);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept the invitation. Consumes the link.' })
  @ApiOkResponse({ type: InvitationResponseDto })
  @ApiNotFoundResponse({ description: 'INVITE_INVALID' })
  @ApiConflictResponse({ description: 'INVITE_ALREADY_ANSWERED' })
  accept(@Param('token') token: string): Promise<InvitationResponseDto> {
    return this.invites.accept(token);
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline the invitation. Consumes the link.' })
  @ApiOkResponse({ type: InvitationResponseDto })
  @ApiNotFoundResponse({ description: 'INVITE_INVALID' })
  @ApiConflictResponse({ description: 'INVITE_ALREADY_ANSWERED' })
  decline(@Param('token') token: string): Promise<InvitationResponseDto> {
    return this.invites.decline(token);
  }
}
