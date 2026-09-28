import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { ClientRefDto } from '../../common';
import { LOCK_LEVELS } from '../../protection/lock-levels';
import { CLIENT_INTENTS, type ClientIntent } from '../request-codes';

/**
 * What the client may say when raising a request.
 *
 * Note what is absent: `method`, `readyAt` and `expiresAt`. The method follows
 * from the user's current lock level and the deadlines are computed on the server
 * -- the prototype computed them on the device and kept them in AsyncStorage,
 * which is indefensible in an app built to resist its own user.
 */
export class CreateRequestDto extends ClientRefDto {
  @ApiProperty({
    description:
      "'disable' turns protection off on approval. 'lower-level' weakens the lock to " +
      'targetLevel instead. The two clear the same barrier and must not have the same ' +
      'effect, so it is stated rather than inferred.',
    enum: CLIENT_INTENTS,
    example: 'disable',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/_/g, '-') : value,
  )
  @IsIn(CLIENT_INTENTS)
  intent: ClientIntent;

  @ApiPropertyOptional({
    description:
      "Required when intent is 'lower-level', forbidden otherwise, and must be below " +
      'the current level. A DB constraint enforces the first two.',
    enum: LOCK_LEVELS,
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @IsIn(LOCK_LEVELS as readonly number[])
  targetLevel?: number;

  @ApiPropertyOptional({
    description:
      'Shown to the partner verbatim. Mandatory for a partner request, optional for a ' +
      'delay -- there is nobody to read it during a countdown.',
    maxLength: 1000,
    example: 'Need to research something for work and the filter is blocking it.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
