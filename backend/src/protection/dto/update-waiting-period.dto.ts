import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

import { WAITING_PERIOD_MINUTES } from '../lock-levels';

export class UpdateWaitingPeriodDto {
  /**
   * A DB check constraint enforces this set. Validating it here as well is the
   * difference between a 400 that names the field and a 500 from Postgres.
   */
  @ApiProperty({
    description: 'One of 15, 60, 1440 or 2880 minutes.',
    enum: WAITING_PERIOD_MINUTES,
    example: 1440,
  })
  @IsInt()
  @IsIn(WAITING_PERIOD_MINUTES)
  minutes: number;
}
