import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const THEMES = ['calm', 'bold', 'minimal'] as const;

/**
 * Lengths are validated here, not left to the database.
 *
 * The columns are `VarChar(40)` and `VarChar(160)`, so an over-long headline is
 * a constraint violation — a 500 dressed up as a database error. Checking in the
 * DTO turns the same input into a 400 that names the field.
 */
export class UpdateBlockedScreenDto {
  @ApiPropertyOptional({ enum: THEMES, description: 'Free on every plan.' })
  @IsOptional()
  @IsIn(THEMES as readonly string[])
  theme?: (typeof THEMES)[number];

  @ApiPropertyOptional({ maxLength: 40, description: 'Premium. Max 40 characters.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  headline?: string;

  @ApiPropertyOptional({ maxLength: 160, description: 'Premium. Max 160 characters.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  message?: string;

  @ApiPropertyOptional({ description: 'Premium.' })
  @IsOptional()
  @IsBoolean()
  showPartnerButton?: boolean;

  @ApiPropertyOptional({ description: 'Premium.' })
  @IsOptional()
  @IsBoolean()
  showBreathingExercise?: boolean;
}
