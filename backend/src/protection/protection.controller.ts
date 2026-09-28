import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentUserId } from '../common';
import {
  SetPinDto,
  ToggleCategoryDto,
  UpdateAccountabilityDto,
  UpdateEnabledDto,
  UpdateLevelDto,
  UpdatePartnerDto,
  UpdateWaitingPeriodDto,
  VerifyPinDto,
} from './dto';
import { ProtectionService } from './protection.service';
import { CategoryRefView, PinGrantView, ProtectionStateView } from './protection.view';

@ApiTags('protection')
@ApiCookieAuth()
@Controller('protection')
export class ProtectionController {
  constructor(private readonly protection: ProtectionService) {}

  @Get()
  @ApiOperation({
    summary: 'Current protection state',
    description: 'Never returns the PIN hash. `pinSet` says whether one exists.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  async state(@CurrentUserId() userId: string): Promise<ProtectionStateView> {
    return this.protection.getState(userId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'The fixed four-row category reference table' })
  @ApiOkResponse({ type: CategoryRefView, isArray: true })
  categories(): CategoryRefView[] {
    return this.protection.listCategories();
  }

  @Put('enabled')
  @ApiOperation({
    summary: 'Turn protection on or off',
    description:
      'On is always immediate. Off is immediate at lock level 1, needs a PIN grant ' +
      'at level 2, and is refused at levels 3 and 4 in favour of POST /requests.',
  })
  @ApiHeader({
    name: 'x-pin-grant',
    required: false,
    description: 'Grant from POST /protection/pin/verify. Alternative to the body field.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  @ApiConflictResponse({ description: 'LOCK_REQUIRES_REQUEST at lock level 3 or 4.' })
  @ApiResponse({ status: 403, description: 'PIN_VERIFICATION_REQUIRED at lock level 2.' })
  async setEnabled(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateEnabledDto,
    @Headers('x-pin-grant') grantHeader?: string,
  ): Promise<ProtectionStateView> {
    return this.protection.setEnabled(userId, dto, grantHeader);
  }

  @Put('level')
  @ApiOperation({
    summary: 'Set the protection lock level',
    description:
      'Raising is always immediate. Lowering is immediate from levels 1 and 2 and ' +
      'refused from 3 and 4: lowering a strong lock has to pass through the lock.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  @ApiConflictResponse({ description: 'LOCK_REQUIRES_REQUEST when lowering from level 3 or 4.' })
  async setLevel(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateLevelDto,
  ): Promise<ProtectionStateView> {
    return this.protection.setLevel(userId, dto);
  }

  @Put('pin')
  @ApiOperation({ summary: 'Set the 4-digit PIN', description: 'Hashed with scrypt.' })
  @ApiOkResponse({ type: ProtectionStateView })
  async setPin(
    @CurrentUserId() userId: string,
    @Body() dto: SetPinDto,
  ): Promise<ProtectionStateView> {
    return this.protection.setPin(userId, dto);
  }

  @Post('pin/verify')
  @HttpCode(HttpStatus.OK)
  // A 4-digit PIN with unlimited attempts is trivially brute-forced. This is the
  // lockout: there is no attempt counter in the schema, so the limiter is it.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Verify the PIN',
    description:
      'On success returns a single-use, short-lived grant that PUT /protection/enabled ' +
      'accepts to turn protection off at lock level 2. Rate limited to 5 per minute.',
  })
  @ApiOkResponse({ type: PinGrantView })
  @ApiResponse({ status: 403, description: 'PIN_INCORRECT.' })
  @ApiResponse({ status: 429, description: 'Too many attempts.' })
  async verifyPin(
    @CurrentUserId() userId: string,
    @Body() dto: VerifyPinDto,
  ): Promise<PinGrantView> {
    const grant = await this.protection.verifyPin(userId, dto.pin);
    return { ok: true, ...grant };
  }

  @Put('waiting-period')
  @ApiOperation({ summary: 'Set the level 3 countdown length' })
  @ApiOkResponse({ type: ProtectionStateView })
  async setWaitingPeriod(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateWaitingPeriodDto,
  ): Promise<ProtectionStateView> {
    return this.protection.setWaitingPeriod(userId, dto);
  }

  @Put('partner')
  @ApiOperation({
    summary: 'Set or clear the level 4 approver',
    description: 'Only a partner whose status is ACTIVE may be set.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  @ApiConflictResponse({ description: 'PARTNER_NOT_ACTIVE.' })
  async setPartner(
    @CurrentUserId() userId: string,
    @Body() dto: UpdatePartnerDto,
  ): Promise<ProtectionStateView> {
    return this.protection.setPartner(userId, dto);
  }

  @Put('accountability')
  @ApiOperation({
    summary: 'Turn accountability on or off',
    description:
      'Turning it off also clears the approver, in the same transaction. It does not ' +
      'change the lock level, and partner records are retained.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  async setAccountability(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateAccountabilityDto,
  ): Promise<ProtectionStateView> {
    return this.protection.setAccountability(userId, dto);
  }

  @Put('categories/:id')
  @ApiOperation({
    summary: 'Toggle one category',
    description:
      'Kebab-case id from the app. Send `{ "on": true|false }` to set a state, or an ' +
      'empty body to flip. adult-search and gambling are premium.',
  })
  @ApiOkResponse({ type: ProtectionStateView })
  @ApiResponse({ status: 402, description: 'PREMIUM_REQUIRED on the FREE plan.' })
  async toggleCategory(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: ToggleCategoryDto,
  ): Promise<ProtectionStateView> {
    return this.protection.toggleCategory(userId, id, dto);
  }
}
