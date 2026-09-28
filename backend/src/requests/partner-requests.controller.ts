import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PartnerRequestsService } from './partner-requests.service';
import { PartnerDecisionView, PartnerRequestView } from './request.view';

/**
 * The partner surface. No session: a partner never gets an account, and the token
 * in the path is the whole credential.
 *
 * Which is why every route here is throttled. The token is 256 bits so guessing is
 * not the threat; the limit is there so a leaked link cannot be used to sweep for
 * state, and so this unauthenticated surface cannot be used to load the database.
 */
@ApiTags('partner-requests')
@AllowAnonymous()
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('p')
export class PartnerRequestsController {
  constructor(private readonly partnerRequests: PartnerRequestsService) {}

  @Get(':token/request')
  @ApiOperation({
    summary: 'The request waiting for this partner',
    description:
      'The reason verbatim, when it was raised, when it lapses, and who is asking. ' +
      'Nothing else: no domains, no devices, no history.',
  })
  @ApiOkResponse({ type: PartnerRequestView })
  @ApiNotFoundResponse({ description: 'LINK_INVALID or NO_PENDING_REQUEST.' })
  async view(@Param('token') token: string): Promise<PartnerRequestView> {
    return this.partnerRequests.view(token);
  }

  @Post(':token/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve the waiting request',
    description:
      'A disable request turns protection off; a lower-level request weakens the lock ' +
      'to its target. Neither does the other.',
  })
  @ApiOkResponse({ type: PartnerDecisionView })
  @ApiConflictResponse({ description: 'REQUEST_EXPIRED or REQUEST_NOT_PENDING.' })
  async approve(@Param('token') token: string): Promise<PartnerDecisionView> {
    return this.partnerRequests.approve(token);
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decline the waiting request',
    description: 'Changes the request and nothing else. Protection state is untouched.',
  })
  @ApiOkResponse({ type: PartnerDecisionView })
  @ApiConflictResponse({ description: 'REQUEST_EXPIRED or REQUEST_NOT_PENDING.' })
  async decline(@Param('token') token: string): Promise<PartnerDecisionView> {
    return this.partnerRequests.decline(token);
  }
}
