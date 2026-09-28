import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** A partial update: every field is optional, absent means "leave it alone". */
export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ description: 'Tell me when something was blocked. A count, never a name.' })
  @IsOptional()
  @IsBoolean()
  blockedAttempts?: boolean;

  @ApiPropertyOptional({ description: 'Tell me when a partner accepts, approves or declines.' })
  @IsOptional()
  @IsBoolean()
  partnerActivity?: boolean;

  @ApiPropertyOptional({ description: 'Weekly summary, counts only.' })
  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;
}
