import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SetPinDto {
  @ApiProperty({
    description: 'Exactly four digits. Stored as a scrypt hash and never returned.',
    example: '4821',
    pattern: '^\\d{4}$',
  })
  @Matches(/^\d{4}$/, { message: 'pin must be exactly 4 digits' })
  pin: string;
}
