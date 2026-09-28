import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ClientRefDto } from '../../common';

/** Trim before validating, so a name of three spaces fails `IsNotEmpty`. */
const trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class CreatePartnerDto extends ClientRefDto {
  @ApiProperty({
    description: "The partner's name, as the user typed it. Initials are derived from it.",
    example: 'Amara Abonyi',
    maxLength: 120,
  })
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description:
      'How the user describes this person. Free text: the invite screen suggests ' +
      'Spouse, Friend, Sibling, Parent and Mentor, but users write their own ' +
      '("Wife"), so this is not an enum and never will be.',
    example: 'Wife',
    maxLength: 60,
  })
  @trim()
  @IsString()
  @IsNotEmpty({ message: 'relationship is required' })
  @MaxLength(60)
  relationship: string;

  @ApiProperty({
    description: 'Where the invitation is sent. Never exposed to anyone but the user.',
    example: 'amara@example.com',
    maxLength: 254,
  })
  @trim()
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(254)
  email: string;
}
