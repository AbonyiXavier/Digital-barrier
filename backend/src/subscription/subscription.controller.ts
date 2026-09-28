import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUserId } from '../common';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionService, type SubscriptionResponse } from './subscription.service';

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get()
  @ApiOperation({
    summary: 'The current plan, and the plan comparison table.',
    description:
      'The `plans` table is served from here so the paywall and the billing ' +
      'state can never disagree about what a plan costs or includes.',
  })
  read(@CurrentUserId() userId: string): Promise<SubscriptionResponse> {
    return this.subscription.read(userId);
  }

  @Put()
  @ApiOperation({
    summary: 'Change plan.',
    description:
      'Stands in for a store purchase — there is no billing integration — so in ' +
      "production this becomes the receipt validator. `renewsAt` is the server's " +
      'to compute and is rejected as input. Downgrading to free deletes nothing: ' +
      'the PIN, the lock level, the blocklist rules and `protectionOn` are all ' +
      'left exactly as they are.',
  })
  update(
    @CurrentUserId() userId: string,
    @Body() body: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    return this.subscription.update(userId, body);
  }
}
