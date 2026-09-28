import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** The two lists, named as the app names them. `ALLOW`/`BLOCK` is the DB spelling. */
export const RULE_LISTS = ['allowed', 'blocked'] as const;
export type RuleListWire = (typeof RULE_LISTS)[number];

export class CreateRuleDto {
  @ApiProperty({
    description:
      'A bare domain. Normalised server-side (lower-cased, scheme and path rejected, ' +
      'leading "www." and "*." dropped) with the same rule the input field applies.',
    example: 'pornhub.com',
  })
  @IsString()
  @MinLength(1)
  // 253 is the longest legal hostname; the shape check happens after normalising.
  @MaxLength(253)
  domain!: string;

  @ApiProperty({
    enum: RULE_LISTS,
    description:
      'Which list. A domain can only be on one: re-adding it to the other list moves it.',
  })
  @IsIn(RULE_LISTS)
  list!: RuleListWire;
}
