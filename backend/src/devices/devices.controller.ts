import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUserId, InstallId } from '../common';
import type { DeviceView } from './device-wire';
import { DevicesService, type ExpectedConfig, type PairingCodeView } from './devices.service';
import {
  CreateDeviceDto,
  HeartbeatDto,
  RecordBlocksDto,
  RegisterThisDeviceDto,
  UpdateDeviceDto,
} from './dto';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @ApiOperation({
    summary: "This account's devices.",
    description:
      '`isCurrent` is computed by comparing each row to the `x-install-id` header, so the ' +
      'same row is current for one caller and not for another. It is never stored.',
  })
  async list(
    @CurrentUserId() userId: string,
    @InstallId() installId: string | undefined,
  ): Promise<DeviceView[]> {
    return this.devices.list(userId, installId);
  }

  @Post('pairing-code')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Issue a pairing code, valid for ten minutes.',
    description:
      'Server-generated and single-use. The alphabet omits I, O, 0 and 1 because the code ' +
      'gets read aloud.',
  })
  async issuePairingCode(@CurrentUserId() userId: string): Promise<PairingCodeView> {
    return this.devices.issuePairingCode(userId);
  }

  @Post('this')
  @ApiOperation({
    summary: 'Register the calling installation as a device.',
    description:
      'No pairing code: the first phone an account signs in on has nothing to pair from. ' +
      'The installation is identified by the `x-install-id` header, and the call is idempotent ' +
      'on it, so a client may make it on every launch. The row starts at `needs-setup` — only ' +
      "the device's own heartbeat can claim it is filtering.",
  })
  @ApiResponse({ status: 201, description: 'The registered device, new or existing.' })
  @ApiResponse({ status: 400, description: 'INSTALL_ID_REQUIRED — no x-install-id header.' })
  @ApiResponse({ status: 402, description: 'PREMIUM_REQUIRED — the free plan covers fewer devices.' })
  async registerSelf(
    @CurrentUserId() userId: string,
    @Body() dto: RegisterThisDeviceDto,
    @InstallId() installId: string | undefined,
  ): Promise<DeviceView> {
    return this.devices.registerSelf(userId, dto, installId);
  }

  @Post()
  @ApiOperation({
    summary: 'Claim a pairing code and register a device.',
    description:
      'The code must exist, belong to this account, be unexpired and unused; it is consumed ' +
      'in the same transaction as the device it creates.',
  })
  @ApiResponse({ status: 201, description: 'The registered device.' })
  @ApiResponse({ status: 402, description: 'PREMIUM_REQUIRED — the free plan covers fewer devices.' })
  @ApiResponse({ status: 404, description: 'PAIRING_CODE_INVALID' })
  @ApiResponse({ status: 409, description: 'PAIRING_CODE_USED / PAIRING_CODE_EXPIRED / INSTALL_ID_IN_USE' })
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateDeviceDto,
    @InstallId() installId: string | undefined,
  ): Promise<DeviceView> {
    return this.devices.create(userId, dto, installId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a device, or pause and resume it.',
    description:
      'Permitted transitions: needs-setup -> protected, protected <-> paused. `offline` is ' +
      'derived from the last heartbeat and cannot be set by a client.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 409, description: 'INVALID_STATUS_TRANSITION' })
  async update(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
    @InstallId() installId: string | undefined,
  ): Promise<DeviceView> {
    return this.devices.update(userId, id, dto, installId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a device and its block history.' })
  @ApiParam({ name: 'id' })
  async remove(@CurrentUserId() userId: string, @Param('id') id: string): Promise<void> {
    await this.devices.remove(userId, id);
  }

  @Post(':id/heartbeat')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check in, and read back the config this device should be running.',
    description:
      'Returning the expected config lets a client that drifted — or was tampered with — ' +
      'correct itself without waiting for someone to open the app.',
  })
  @ApiParam({ name: 'id' })
  async heartbeat(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: HeartbeatDto,
  ): Promise<ExpectedConfig> {
    return this.devices.heartbeat(userId, id, dto);
  }

  @Post(':id/blocks')
  @HttpCode(200)
  @ApiOperation({
    summary: "Report a day's block count.",
    description:
      'A COUNT ONLY. No domain, hostname, URL or category is accepted, logged or stored — ' +
      'the app promises blocked activity is "a number, never a name", and there is no column ' +
      'for one anywhere in the schema. Any unexpected field is rejected with 400.',
  })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 400, description: 'A body field other than `day` and `count` was sent.' })
  async recordBlocks(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RecordBlocksDto,
  ): Promise<{ day: string; count: number }> {
    return this.devices.recordBlocks(userId, id, dto);
  }
}
