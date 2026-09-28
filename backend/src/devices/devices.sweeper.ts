/**
 * The offline sweep.
 *
 * `OFFLINE` is derived, not reported: a device that has stopped talking to us is
 * exactly the device that cannot tell us so. Every five minutes, anything that
 * claims to be PROTECTED but has not checked in within
 * `DEVICE_OFFLINE_AFTER_MINUTES` is marked offline, which is what turns a
 * silently-uninstalled agent into something visible in the app.
 *
 * Runs more often than the timeout it enforces, so the worst-case lag between a
 * device going quiet and the app saying so is the timeout plus one tick.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { DevicesService } from './devices.service';

@Injectable()
export class DevicesSweeper {
  private readonly logger = new Logger(DevicesSweeper.name);

  constructor(private readonly devices: DevicesService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'devices.offline-sweep' })
  async sweep(): Promise<void> {
    try {
      await this.devices.sweepOffline();
    } catch (error) {
      // A failed sweep is stale statuses, not a broken process; the next tick retries.
      this.logger.error(
        `offline sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
