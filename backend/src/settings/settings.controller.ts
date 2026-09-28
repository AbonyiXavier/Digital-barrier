import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUserId } from '../common';
import {
  UpdateApprovalSettingsDto,
  UpdateBlockedScreenDto,
  UpdateNotificationSettingsDto,
} from './dto';
import {
  SettingsService,
  type ApprovalSettingsView,
  type BlockedScreenView,
  type NotificationSettingsView,
} from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'Which notifications this user wants.' })
  readNotifications(@CurrentUserId() userId: string): Promise<NotificationSettingsView> {
    return this.settings.readNotifications(userId);
  }

  @Put('notifications')
  @ApiOperation({ summary: 'Update notification preferences.' })
  updateNotifications(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsView> {
    return this.settings.updateNotifications(userId, dto);
  }

  @Get('approval')
  @ApiOperation({ summary: 'What the accountability partner is told about.' })
  readApproval(@CurrentUserId() userId: string): Promise<ApprovalSettingsView> {
    return this.settings.readApproval(userId);
  }

  @Put('approval')
  @ApiOperation({
    summary: 'Update partner notification preferences.',
    description:
      'shareActivityDetail is rejected: a partner can never see browsing activity, ' +
      'so there is no value to set.',
  })
  @ApiResponse({ status: 400, description: 'shareActivityDetail was supplied.' })
  updateApproval(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateApprovalSettingsDto,
  ): Promise<ApprovalSettingsView> {
    return this.settings.updateApproval(userId, dto);
  }

  @Get('blocked-screen')
  @ApiOperation({ summary: 'The page shown instead of a DNS error.' })
  readBlockedScreen(@CurrentUserId() userId: string): Promise<BlockedScreenView> {
    return this.settings.readBlockedScreen(userId);
  }

  @Put('blocked-screen')
  @ApiOperation({
    summary: 'Customise the blocked screen.',
    description: 'Theme is free on every plan; the wording and toggles are Premium.',
  })
  @ApiResponse({ status: 403, description: 'PREMIUM_REQUIRED for the wording or toggles.' })
  updateBlockedScreen(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateBlockedScreenDto,
  ): Promise<BlockedScreenView> {
    return this.settings.updateBlockedScreen(userId, dto);
  }
}
