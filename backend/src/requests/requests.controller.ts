import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUserId } from '../common';
import { CreateRequestDto, ListRequestsQueryDto } from './dto';
import { RequestView } from './request.view';
import { RequestsService } from './requests.service';

@ApiTags('requests')
@ApiCookieAuth()
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @ApiOperation({
    summary: 'Raise a disable or lower-level request',
    description:
      'The method follows from the current lock level (3 gives DELAY, 4 gives PARTNER) ' +
      'and both deadlines are computed on the server. At levels 1 and 2 there is ' +
      'nothing to request: change protection directly.',
  })
  @ApiCreatedResponse({ type: RequestView })
  @ApiConflictResponse({
    description: 'REQUEST_ALREADY_PENDING, LOCK_ALLOWS_DIRECT_CHANGE or NO_ACTIVE_PARTNER.',
  })
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateRequestDto,
  ): Promise<RequestView> {
    return this.requests.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Request history, newest first' })
  @ApiOkResponse({ type: RequestView, isArray: true })
  async list(
    @CurrentUserId() userId: string,
    @Query() query: ListRequestsQueryDto,
  ): Promise<RequestView[]> {
    return this.requests.list(userId, query);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw a pending request',
    description: 'Allowed at any time while pending. Nothing but the status changes.',
  })
  @ApiOkResponse({ type: RequestView })
  @ApiConflictResponse({ description: 'REQUEST_NOT_PENDING.' })
  async cancel(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<RequestView> {
    return this.requests.cancel(userId, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Claim a delay request whose countdown has finished',
    description:
      'DELAY requests only, and only once readyAt has passed. PARTNER requests are ' +
      'decided by the partner and never here.',
  })
  @ApiOkResponse({ type: RequestView })
  @ApiConflictResponse({
    description: 'WAITING_PERIOD_NOT_ELAPSED, PARTNER_APPROVAL_REQUIRED or REQUEST_NOT_PENDING.',
  })
  async approve(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ): Promise<RequestView> {
    return this.requests.approve(userId, id);
  }
}
