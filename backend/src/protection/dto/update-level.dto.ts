import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt } from 'class-validator';

import { LOCK_LEVELS, type LockLevel } from '../lock-levels';

export class UpdateLevelDto {
  @ApiProperty({
    description:
      'The protection lock: 1 none, 2 pin, 3 delay, 4 partner. Raising is always ' +
      'immediate. Lowering is immediate from 1 or 2 only; from 3 or 4 it must go ' +
      "through a request with intent 'lower-level'.",
    enum: LOCK_LEVELS,
    example: 3,
  })
  @IsInt()
  @IsIn(LOCK_LEVELS as readonly number[])
  level: LockLevel;
}
