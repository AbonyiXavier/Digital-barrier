import { Module } from '@nestjs/common';

import { AppConfigService } from '../config';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DevicesSweeper } from './devices.sweeper';

@Module({
  controllers: [DevicesController],
  providers: [AppConfigService, DevicesService, DevicesSweeper],
  exports: [DevicesService],
})
export class DevicesModule {}
