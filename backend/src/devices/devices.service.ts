/**
 * Devices.
 *
 * Three things the prototype left to the client are server-owned here, because
 * each of them is a thing a determined user would otherwise simply edit:
 *
 *  - pairing codes are issued, expired and consumed by the server;
 *  - the free-plan device cap is enforced, not just written in the marketing copy;
 *  - `OFFLINE` is derived from `lastSeenAt` by a sweep and can never be claimed.
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Device, DeviceStatus, Prisma } from '../../generated/prisma/client';
import { AppConfigService } from '../config';
import { PrismaService } from '../prisma';
import {
  toDbPlatform,
  toDbStatus,
  toWireCategory,
  toWirePlatform,
  toWireStatus,
  type DeviceView,
  type ProtectionCategoryWire,
} from './device-wire';
import type { CreateDeviceDto, RecordBlocksDto, UpdateDeviceDto } from './dto';
import { CODE_TTL_MS, generatePairingCode, normalisePairingCode } from './pairing-code';

/** Seven days of history, which is what the sparkline draws. */
const WEEK = 7;

/**
 * The only transitions a client may ask for.
 *
 * `OFFLINE` appears as neither a source nor a target: it is not a state anyone
 * moves into, it is an observation the sweep makes, and a heartbeat is what
 * clears it.
 */
const ALLOWED_TRANSITIONS: Record<DeviceStatus, readonly DeviceStatus[]> = {
  NEEDS_SETUP: ['PROTECTED'],
  PROTECTED: ['PAUSED'],
  PAUSED: ['PROTECTED'],
  OFFLINE: [],
};

export interface PairingCodeView {
  code: string;
  expiresAt: string;
}

export interface ExpectedConfig {
  deviceId: string;
  status: DeviceView['status'];
  /** Whether the device should be filtering at all. */
  protectionOn: boolean;
  enabledCategories: ProtectionCategoryWire[];
  /** So a client with a skewed clock can still reason about its own heartbeats. */
  serverTime: string;
}

/** UTC midnight, `offset` days before today. Matches how BlockCount.day is stored. */
function dayAt(offset: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

/** UTC midnight for a `YYYY-MM-DD` string, rejecting anything that is not a real date. */
function parseDay(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({ code: 'INVALID_DAY', message: `${value} is not a date.` });
  }
  // Round-trip so 2026-02-31 cannot arrive as 2026-03-03.
  if (date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException({ code: 'INVALID_DAY', message: `${value} is not a date.` });
  }
  return date;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * The user's devices.
   *
   * `isCurrent` is computed from the caller's `x-install-id`, never read from a
   * column: it is a property of the request. Storing it would mean two devices
   * both believing they were current the moment a row was written from the wrong
   * phone, and nothing would ever correct it.
   */
  async list(userId: string, installId: string | undefined): Promise<DeviceView[]> {
    const devices = await this.prisma.device.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }],
    });
    if (devices.length === 0) return [];

    const since = dayAt(WEEK - 1);
    const counts = await this.prisma.blockCount.findMany({
      where: { deviceId: { in: devices.map((device) => device.id) }, day: { gte: since } },
      select: { deviceId: true, day: true, count: true },
    });

    // Index by device and day so a device with gaps still gets seven numbers.
    const byDevice = new Map<string, Map<string, number>>();
    for (const row of counts) {
      const key = row.day.toISOString().slice(0, 10);
      const forDevice = byDevice.get(row.deviceId) ?? new Map<string, number>();
      forDevice.set(key, row.count);
      byDevice.set(row.deviceId, forDevice);
    }

    return devices.map((device) => ({
      id: device.id,
      name: device.name,
      platform: toWirePlatform(device.platform),
      status: toWireStatus(device.status),
      lastSeen: device.lastSeenAt.toISOString(),
      isCurrent: installId !== undefined && device.installId === installId,
      weeklyBlocks: this.weeklyBlocks(byDevice.get(device.id)),
      clientRef: device.clientRef ?? null,
    }));
  }

  /**
   * Seven counts, oldest first, index 6 = today.
   *
   * That orientation is not arbitrary: the app's sparkline and its weekday labels
   * both read it this way, and the seed data is written to match. Reversing it
   * would draw a plausible-looking chart of the wrong week.
   */
  private weeklyBlocks(days: Map<string, number> | undefined): number[] {
    const week: number[] = [];
    for (let offset = WEEK - 1; offset >= 0; offset -= 1) {
      const key = dayAt(offset).toISOString().slice(0, 10);
      week.push(days?.get(key) ?? 0);
    }
    return week;
  }

  /** Issue a pairing code for this user. */
  async issuePairingCode(userId: string): Promise<PairingCodeView> {
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // 32^6 makes a collision vanishingly unlikely, but "unlikely" is not "handled":
    // the unique constraint is the real check and a few retries absorb it.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generatePairingCode();
      try {
        await this.prisma.pairingCode.create({ data: { code, userId, expiresAt } });
        return { code, expiresAt: expiresAt.toISOString() };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException({
      code: 'CODE_GENERATION_FAILED',
      message: 'Could not issue a pairing code. Try again.',
    });
  }

  /**
   * Claim a pairing code and register the device.
   *
   * One transaction: validating the code, counting devices against the plan and
   * consuming the code all have to commit together, or two phones racing the same
   * code both get in and the cap is enforced against a count that was already stale.
   */
  async create(
    userId: string,
    dto: CreateDeviceDto,
    callerInstallId: string | undefined,
  ): Promise<DeviceView> {
    // A retried create with the same clientRef is the same create, and by then the
    // code it used is legitimately consumed. Answer from the existing row.
    if (dto.clientRef !== undefined) {
      const existing = await this.prisma.device.findUnique({
        where: { userId_clientRef: { userId, clientRef: dto.clientRef } },
      });
      if (existing !== null) return this.viewOf(existing, callerInstallId);
    }

    const code = normalisePairingCode(dto.code);

    const device = await this.prisma.$transaction(async (tx) => {
      const pairing = await tx.pairingCode.findUnique({ where: { code } });
      if (pairing === null) {
        throw new NotFoundException({
          code: 'PAIRING_CODE_INVALID',
          message: 'That pairing code does not exist.',
        });
      }
      // Codes belong to the account that asked for one. A code that is not yours
      // is not "expired" or "used" — it is someone else's, and saying so is the
      // point of having an owner column at all.
      if (pairing.userId !== userId) {
        throw new ForbiddenException({
          code: 'PAIRING_CODE_NOT_YOURS',
          message: 'That pairing code belongs to another account.',
        });
      }
      if (pairing.consumedAt !== null) {
        throw new ConflictException({
          code: 'PAIRING_CODE_USED',
          message: 'That pairing code has already been used.',
        });
      }
      if (pairing.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({
          code: 'PAIRING_CODE_EXPIRED',
          message: 'That pairing code has expired. Generate a new one.',
        });
      }

      await this.assertDeviceCap(tx, userId);

      if (dto.installId !== undefined) {
        const taken = await tx.device.findUnique({
          where: { installId: dto.installId },
          select: { id: true },
        });
        if (taken !== null) {
          throw new ConflictException({
            code: 'INSTALL_ID_IN_USE',
            message: 'This installation is already registered as a device.',
          });
        }
      }

      const created = await tx.device.create({
        data: {
          userId,
          name: dto.name,
          platform: toDbPlatform(dto.platform),
          // A freshly paired device has not proved it is filtering yet, so it
          // starts at NEEDS_SETUP rather than claiming protection it may not have.
          status: 'NEEDS_SETUP',
          installId: dto.installId ?? null,
          clientRef: dto.clientRef ?? null,
          lastSeenAt: new Date(),
        },
      });

      // Consumed in the same transaction as the device it created: a code that
      // produced a device but stayed usable is a second free device.
      await tx.pairingCode.update({
        where: { code },
        data: { consumedAt: new Date() },
      });

      return created;
    });

    this.logger.log(`paired device ${device.id} (${device.platform}) for user ${userId}`);
    return this.viewOf(device, callerInstallId);
  }

  /**
   * The free-plan cap.
   *
   * The app says "Free covers one device" as copy and never enforces it. 402 with
   * `PREMIUM_REQUIRED` is the enforcement; the limit comes from config so it is
   * not a magic number in two places.
   */
  private async assertDeviceCap(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const subscription = await tx.subscription.findUnique({
      where: { userId },
      select: { plan: true },
    });
    // No subscription row is treated as FREE: the restrictive reading is the safe
    // one, since the alternative gives unlimited devices to an incomplete signup.
    const plan = subscription?.plan ?? 'FREE';
    if (plan !== 'FREE') return;

    const limit = this.config.freePlanDeviceLimit;
    const count = await tx.device.count({ where: { userId } });
    if (count >= limit) {
      // Nest has no PaymentRequiredException; 402 is the status the app's paywall
      // copy implies, and PREMIUM_REQUIRED is what the client switches on.
      throw new HttpException(
        {
          code: 'PREMIUM_REQUIRED',
          message:
            limit === 1
              ? 'Free covers one device. Upgrade to protect more.'
              : `Free covers ${limit} devices. Upgrade to protect more.`,
          details: { plan, limit, current: count },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  async update(
    userId: string,
    deviceId: string,
    dto: UpdateDeviceDto,
    callerInstallId: string | undefined,
  ): Promise<DeviceView> {
    const device = await this.owned(userId, deviceId);

    const data: Prisma.DeviceUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;

    if (dto.status !== undefined) {
      const next = toDbStatus(dto.status);
      if (next !== device.status && !ALLOWED_TRANSITIONS[device.status].includes(next)) {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message:
            device.status === 'OFFLINE'
              ? 'This device is offline. It comes back when it next checks in.'
              : `A device cannot go from ${device.status} to ${next}.`,
          details: { from: device.status, to: next, allowed: ALLOWED_TRANSITIONS[device.status] },
        });
      }
      data.status = next;
    }

    if (Object.keys(data).length === 0) return this.viewOf(device, callerInstallId);

    const updated = await this.prisma.device.update({ where: { id: deviceId }, data });
    return this.viewOf(updated, callerInstallId);
  }

  async remove(userId: string, deviceId: string): Promise<void> {
    await this.owned(userId, deviceId);
    // BlockCount cascades, which is the intent: removing a device removes its
    // history, and there is nothing else about it worth keeping.
    await this.prisma.device.delete({ where: { id: deviceId } });
  }

  /**
   * Check in.
   *
   * Returns the config the device should be running, so a client that missed a
   * change (or was tampered with) corrects itself on its next heartbeat instead of
   * waiting for someone to open the app.
   */
  async heartbeat(userId: string, deviceId: string): Promise<ExpectedConfig> {
    const device = await this.owned(userId, deviceId);

    const protection = await this.prisma.protection.findUnique({
      where: { userId },
      select: { protectionOn: true, enabledCategories: true },
    });

    // A heartbeat is proof of life, so it clears a derived OFFLINE. It does not
    // touch PAUSED or NEEDS_SETUP: those are real states, not observations.
    const status: DeviceStatus = device.status === 'OFFLINE' ? 'PROTECTED' : device.status;
    const updated = await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), ...(status !== device.status ? { status } : {}) },
      select: { id: true, status: true },
    });

    return {
      deviceId: updated.id,
      status: toWireStatus(updated.status),
      // Protection off, or the device paused, both mean "do not filter right now".
      protectionOn: (protection?.protectionOn ?? true) && updated.status !== 'PAUSED',
      enabledCategories: (protection?.enabledCategories ?? []).map(toWireCategory),
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Record a day's blocks.
   *
   * A count and a date. There is no argument here for a domain, a URL or a
   * category, and there is no column for one either — see `RecordBlocksDto`.
   *
   * The count is replaced rather than incremented: a client reports its running
   * total for the day, so a retried or duplicated report converges instead of
   * doubling the number on the dashboard.
   */
  async recordBlocks(
    userId: string,
    deviceId: string,
    dto: RecordBlocksDto,
  ): Promise<{ day: string; count: number }> {
    await this.owned(userId, deviceId);
    const day = parseDay(dto.day);

    if (day.getTime() > dayAt(0).getTime()) {
      throw new BadRequestException({
        code: 'DAY_IN_FUTURE',
        message: 'That day has not happened yet.',
      });
    }

    const row = await this.prisma.blockCount.upsert({
      where: { deviceId_day: { deviceId, day } },
      create: { deviceId, day, count: dto.count },
      update: { count: dto.count },
      select: { day: true, count: true },
    });
    return { day: row.day.toISOString().slice(0, 10), count: row.count };
  }

  /**
   * Mark devices offline.
   *
   * Only `PROTECTED` rows: a paused device is paused whether or not it is talking
   * to us, and `NEEDS_SETUP` has never checked in by definition. Overwriting
   * either with OFFLINE would lose the reason the device is not protecting.
   */
  async sweepOffline(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.deviceOfflineAfterMinutes * 60_000);
    const result = await this.prisma.device.updateMany({
      where: { status: 'PROTECTED', lastSeenAt: { lt: cutoff } },
      data: { status: 'OFFLINE' },
    });
    if (result.count > 0) {
      this.logger.log(
        `marked ${result.count} device(s) offline (no heartbeat since ${cutoff.toISOString()})`,
      );
    }
    return result.count;
  }

  /** Scope every single-device operation by owner, so an id from elsewhere is a 404. */
  private async owned(userId: string, deviceId: string): Promise<Device> {
    const device = await this.prisma.device.findFirst({ where: { id: deviceId, userId } });
    if (device === null) {
      throw new NotFoundException({ code: 'DEVICE_NOT_FOUND', message: 'No such device.' });
    }
    return device;
  }

  /** One device, with its week. */
  private async viewOf(device: Device, callerInstallId: string | undefined): Promise<DeviceView> {
    const counts = await this.prisma.blockCount.findMany({
      where: { deviceId: device.id, day: { gte: dayAt(WEEK - 1) } },
      select: { day: true, count: true },
    });
    const days = new Map(counts.map((row) => [row.day.toISOString().slice(0, 10), row.count]));
    return {
      id: device.id,
      name: device.name,
      platform: toWirePlatform(device.platform),
      status: toWireStatus(device.status),
      lastSeen: device.lastSeenAt.toISOString(),
      isCurrent: callerInstallId !== undefined && device.installId === callerInstallId,
      weeklyBlocks: this.weeklyBlocks(days),
      clientRef: device.clientRef ?? null,
    };
  }
}

/** Prisma's unique-constraint error, without importing its error classes wholesale. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
