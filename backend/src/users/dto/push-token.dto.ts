import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

import type { DevicePlatform } from '../../../generated/prisma/client';

const PLATFORMS = ['ios', 'android', 'macos', 'windows'] as const;

export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString()
  @Length(1, 512)
  token!: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS as readonly string[])
  platform!: (typeof PLATFORMS)[number];
}

export const toDevicePlatform = (value: PushTokenDto['platform']): DevicePlatform =>
  value.toUpperCase() as DevicePlatform;
