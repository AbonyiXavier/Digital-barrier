import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

import { PLATFORM_WIRE, type DevicePlatformWire } from '../device-wire';

/**
 * Registering the installation that is calling.
 *
 * Deliberately has no `code`: a pairing code is how an *existing* device vouches
 * for a new one, and the first phone someone signs in on has nothing to pair
 * from. Requiring one there is what left accounts with zero devices while the app
 * told them protection was running.
 *
 * There is no `installId` field either — it is read from the `x-install-id`
 * header. A caller that could name any installation could register a row
 * shadowing another device's, and the header is the one value the client cannot
 * choose per-request.
 */
export class RegisterThisDeviceDto {
  @ApiProperty({
    description: "The device's name, as shown in the list.",
    example: 'Redmi Note 9S',
  })
  @IsString()
  @Length(1, 60)
  name!: string;

  @ApiProperty({ enum: PLATFORM_WIRE })
  @IsIn(PLATFORM_WIRE)
  platform!: DevicePlatformWire;
}
