import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUserId, InstallId } from '../common';
import type { BootstrapResponse, BootstrapUser } from './bootstrap.types';
import { OnboardingDto } from './dto/onboarding.dto';
import { PushTokenDto, toDevicePlatform } from './dto/push-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService, type OnboardingResult } from './users.service';

@ApiTags('me')
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('bootstrap')
  @ApiOperation({
    summary: 'The entire client state, in one call.',
    description:
      "Everything the mobile app's reducer holds: the user, protection, the lock, " +
      'devices, partners, requests, subscription, blocklist, settings and the ' +
      "seven-day block counts. One call rather than fourteen, because the app's " +
      'state is hydrated atomically and a dashboard assembled from ten parallel ' +
      'responses can show a protection state and a lock level that never ' +
      'coexisted. Send `x-install-id` to have `devices[].isCurrent` computed. ' +
      'Timestamps are ISO 8601 UTC; `lock.pinSet` is a boolean and the PIN hash ' +
      'is never returned.',
  })
  bootstrap(
    @CurrentUserId() userId: string,
    @InstallId() installId?: string,
  ): Promise<BootstrapResponse> {
    return this.users.bootstrap(userId, installId);
  }

  @Post('onboarding')
  @ApiOperation({
    summary: 'Finish onboarding.',
    description:
      'Sets `protectedSince` (which drives "protected for N days"), stores the ' +
      'chosen categories and forces protection on. Idempotent, and a repeat call ' +
      'does not move `protectedSince`.',
  })
  onboarding(
    @CurrentUserId() userId: string,
    @Body() body: OnboardingDto,
  ): Promise<OnboardingResult> {
    return this.users.completeOnboarding(userId, body.categories);
  }

  @Patch()
  @ApiOperation({ summary: 'Update name or email.' })
  updateProfile(
    @CurrentUserId() userId: string,
    @Body() body: UpdateProfileDto,
  ): Promise<BootstrapUser> {
    return this.users.updateProfile(userId, body);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Account and everything belonging to it are gone.' })
  @ApiOperation({
    summary: 'Delete the account.',
    description:
      'Real deletion, not a flag: schema-level cascades remove the protection ' +
      'row, devices and their block counts, partners, requests, rules, push ' +
      'tokens and sessions.',
  })
  deleteAccount(@CurrentUserId() userId: string): Promise<void> {
    return this.users.deleteAccount(userId);
  }

  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Queued. The file is emailed.' })
  @ApiOperation({
    summary: 'Request a data export.',
    description:
      'Writes an outbox event and returns 202. Delivery is the notification ' +
      "consumer's job, so the promise survives a crash between the request and " +
      'the email.',
  })
  export(@CurrentUserId() userId: string): Promise<{ status: 'accepted'; requestedAt: string }> {
    return this.users.requestExport(userId);
  }

  @Post('push-token')
  @ApiOkResponse({ description: 'Token stored.' })
  @ApiOperation({
    summary: 'Register an Expo push token.',
    description: 'Upserted on the token, so re-registering the same handset adds no rows.',
  })
  pushToken(
    @CurrentUserId() userId: string,
    @Body() body: PushTokenDto,
  ): Promise<{ registered: true }> {
    return this.users.savePushToken(userId, body.token, toDevicePlatform(body.platform));
  }
}
