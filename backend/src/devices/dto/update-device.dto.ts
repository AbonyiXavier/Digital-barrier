import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

import { CLIENT_SETTABLE_STATUS_WIRE, type ClientSettableStatusWire } from '../device-wire';

export class UpdateDeviceDto {
  @ApiPropertyOptional({ example: 'Study PC' })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @ApiPropertyOptional({
    enum: CLIENT_SETTABLE_STATUS_WIRE,
    description:
      '`offline` is absent on purpose: it is derived from `lastSeenAt` by a sweep, so a ' +
      'client that could set it could also claim to be online while silently unprotected. ' +
      'Permitted moves: needs-setup -> protected, and protected <-> paused.',
  })
  @IsOptional()
  @IsIn(CLIENT_SETTABLE_STATUS_WIRE)
  status?: ClientSettableStatusWire;
}
