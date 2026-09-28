import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from './notification-channel';
import { Inject } from '@nestjs/common';

const DAYS_IN_WINDOW = 7;

/**
 * The weekly partner digest.
 *
 * Counts only. The product's privacy page promises a partner is told "how many
 * requests were blocked — a count per day. A number, never a name", and there is
 * no table from which a name could be read even if this wanted to.
 */
@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: readonly NotificationChannel[],
  ) {}

  @Cron(CronExpression.EVERY_WEEK)
  async send(): Promise<void> {
    const subscribers = await this.prisma.approvalSettings.findMany({
      where: { weeklyDigest: true },
      select: { userId: true },
    });
    if (subscribers.length === 0) return;

    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (DAYS_IN_WINDOW - 1));

    for (const { userId } of subscribers) {
      try {
        await this.sendFor(userId, since);
      } catch (error) {
        // One user's digest failing must not stop the rest of the run.
        this.logger.error(
          `digest failed for ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async sendFor(userId: string, since: Date): Promise<void> {
    const [protection, user] = await Promise.all([
      this.prisma.protection.findUnique({ where: { userId }, select: { partnerId: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    if (protection?.partnerId == null) return;

    const partner = await this.prisma.partner.findFirst({
      where: { id: protection.partnerId, status: 'ACTIVE' },
      select: { email: true },
    });
    if (!partner) return;

    const [blocks, requests] = await Promise.all([
      this.prisma.blockCount.aggregate({
        _sum: { count: true },
        where: { day: { gte: since }, device: { userId } },
      }),
      this.prisma.disableRequest.count({
        where: { userId, requestedAt: { gte: since } },
      }),
    ]);

    const blocked = blocks._sum.count ?? 0;
    const name = user?.name ?? 'Your partner';
    const message = {
      kind: 'weekly-digest' as const,
      email: partner.email,
      subject: `${name}: this week in numbers`,
      body:
        `${blocked} block${blocked === 1 ? '' : 's'} in the last ${DAYS_IN_WINDOW} days, ` +
        `and ${requests} request${requests === 1 ? '' : 's'} to turn protection off.\n\n` +
        `That is everything we can tell you. No sites, no searches — by design.`,
    };

    for (const channel of this.channels) {
      await channel.send(message);
    }
  }
}
