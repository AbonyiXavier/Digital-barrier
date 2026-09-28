import { ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsOptional } from 'class-validator';

export class UpdateApprovalSettingsDto {
  @ApiPropertyOptional({ description: 'The partner is told when protection is disabled.' })
  @IsOptional()
  @IsBoolean()
  notifyOnDisable?: boolean;

  @ApiPropertyOptional({ description: 'The partner is told when the lock level is lowered.' })
  @IsOptional()
  @IsBoolean()
  notifyOnLevelChange?: boolean;

  @ApiPropertyOptional({
    description:
      'The partner gets a weekly summary instead of individual events. Counts only.',
  })
  @IsOptional()
  @IsBoolean()
  weeklyDigest?: boolean;

  /**
   * Declared only so that sending it produces a 400 that says why.
   *
   * There is no `shareActivityDetail` column and there never will be: the app
   * calls it "not a setting — a guarantee", and a column would imply it could be
   * switched on. `Equals` can never be satisfied, so any value at all — `false`
   * included — is rejected rather than silently accepted and dropped.
   */
  @ApiPropertyOptional({
    description:
      'Always rejected. A partner can never see browsing activity; this is a ' +
      'guarantee, not a setting, and has no stored value.',
  })
  @IsOptional()
  @Equals(Symbol('unsatisfiable'), {
    message:
      'shareActivityDetail is a guarantee, not a setting: a partner can never see ' +
      'browsing activity, so there is nothing to configure.',
  })
  shareActivityDetail?: unknown;
}
