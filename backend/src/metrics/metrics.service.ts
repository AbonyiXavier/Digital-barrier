import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';
import { WINDOW_DAYS, windowKeys, zeroWindow } from './block-window';

/** Blocks per device over the window, plus the totals the dashboard shows. */
export interface BlockWindow {
  /** Length 7, oldest first, index 6 = today. */
  weeklyBlocks: number[];
  blocksToday: number;
  perDevice: { deviceId: string; weeklyBlocks: number[] }[];
}

interface CountRow {
  deviceId: string;
  day: string;
  count: number;
}

/**
 * The whole analytics surface.
 *
 * `BlockCount(deviceId, day, count)` is the only telemetry that exists, and it
 * holds an integer. Nothing here accepts or returns a domain, a hostname, a URL
 * or a per-site breakdown, because the product promises "a count per day. A
 * number, never a name." There is no column that could betray that, and this
 * service deliberately adds no way to ask for one.
 */
@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async blockWindow(userId: string, now: Date = new Date()): Promise<BlockWindow> {
    const keys = windowKeys(now);
    const oldest = keys[0];
    const today = keys[WINDOW_DAYS - 1];
    const index = new Map(keys.map((key, position) => [key, position]));

    // Devices first, so a device with no counts still reports a run of zeroes
    // rather than vanishing from `perDevice`.
    const devices = await this.prisma.device.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const perDevice = new Map(devices.map((device) => [device.id, zeroWindow()]));
    const weeklyBlocks = zeroWindow();

    if (devices.length > 0) {
      // Raw, and joined on device rather than filtered by an id list, so the
      // day comes back as text from Postgres and no `Date` conversion can shift
      // a row into the wrong bucket.
      const rows = await this.prisma.$queryRaw<CountRow[]>`
        SELECT bc."deviceId" AS "deviceId",
               to_char(bc."day", 'YYYY-MM-DD') AS "day",
               bc."count"::int AS "count"
        FROM "block_count" bc
        JOIN "device" d ON d."id" = bc."deviceId"
        WHERE d."userId" = ${userId}
          AND bc."day" >= ${oldest}::date
          AND bc."day" <= ${today}::date
      `;

      for (const row of rows) {
        const position = index.get(row.day);
        const bucket = perDevice.get(row.deviceId);
        if (position === undefined || bucket === undefined) continue;
        bucket[position] += row.count;
        weeklyBlocks[position] += row.count;
      }
    }

    return {
      weeklyBlocks,
      blocksToday: weeklyBlocks[WINDOW_DAYS - 1],
      perDevice: [...perDevice].map(([deviceId, blocks]) => ({
        deviceId,
        weeklyBlocks: blocks,
      })),
    };
  }

  /** Window total, for the weekly digest. Counts only. */
  async weeklyTotal(userId: string, now: Date = new Date()): Promise<number> {
    const window = await this.blockWindow(userId, now);
    return window.weeklyBlocks.reduce((sum, value) => sum + value, 0);
  }
}
