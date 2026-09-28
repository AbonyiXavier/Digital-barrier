import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

import { ClientRefDto } from '../../common';
import { PLATFORM_WIRE, type DevicePlatformWire } from '../device-wire';
import { PAIRING_CODE_PATTERN, normalisePairingCode } from '../pairing-code';

export class CreateDeviceDto extends ClientRefDto {
  @ApiProperty({
    description:
      'The pairing code shown on the phone. Server-issued: the prototype invented these ' +
      'on the device and never verified them.',
    example: 'K7M2QP',
  })
  // Normalised before validation, because the code is read off a screen and typed
  // by hand: casing and stray spacing are the user's, not an error.
  @Transform(({ value }) => (typeof value === 'string' ? normalisePairingCode(value) : value))
  @IsString()
  @Matches(PAIRING_CODE_PATTERN, {
    message: 'A pairing code is 6 characters from A-Z (no I or O) and 2-9.',
  })
  code!: string;

  @ApiProperty({ description: "The device's name, as shown in the list.", example: 'Study PC' })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ enum: PLATFORM_WIRE })
  @IsIn(PLATFORM_WIRE)
  platform!: DevicePlatformWire;

  @ApiPropertyOptional({
    description:
      'This installation\'s stable id. Supplying it is what lets `isCurrent` be computed ' +
      'later instead of stored.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  installId?: string;
}
