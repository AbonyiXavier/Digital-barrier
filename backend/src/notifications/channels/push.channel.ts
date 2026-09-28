import { Injectable, Logger } from '@nestjs/common';
import { Expo } from 'expo-server-sdk';

import { AppConfigService } from '../../config';
import { PrismaService } from '../../prisma';
import type { NotificationChannel, NotificationMessage } from '../notification-channel';

/**
 * Expo push.
 *
 * Only messages aimed at an app user are pushed — a partner has no app, by
 * design, so partner-facing mail never routes here.
 */
@Injectable()
export class PushChannel implements NotificationChannel {
  readonly name = 'push' as const;
  private readonly logger = new Logger('Notify:push');
  private readonly expo: Expo;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfigService,
  ) {
    this.expo = new Expo(
      config.expoAccessToken !== '' ? { accessToken: config.expoAccessToken } : {},
    );
  }

  async send(message: NotificationMessage): Promise<void> {
    if (message.userId === undefined) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: message.userId },
      select: { id: true, token: true },
    });
    const valid = tokens.filter((row) => Expo.isExpoPushToken(row.token));

    // A token that is no longer a valid Expo token will never work again.
    const stale = tokens.filter((row) => !Expo.isExpoPushToken(row.token));
    if (stale.length > 0) {
      await this.prisma.pushToken.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    }
    if (valid.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(
      valid.map((row) => ({
        to: row.token,
        title: message.subject,
        body: message.body,
        data: { kind: message.kind, ...(message.url !== undefined ? { url: message.url } : {}) },
      })),
    );

    for (const chunk of chunks) {
      const receipts = await this.expo.sendPushNotificationsAsync(chunk);
      for (const receipt of receipts) {
        if (receipt.status === 'error') {
          this.logger.warn(`push rejected: ${receipt.message}`);
          // Expo tells us explicitly when a device has uninstalled.
          if (receipt.details?.error === 'DeviceNotRegistered') {
            const token = (receipt as { details?: { expoPushToken?: string } }).details
              ?.expoPushToken;
            if (token !== undefined) {
              await this.prisma.pushToken.deleteMany({ where: { token } });
            }
          }
        }
      }
    }
  }
}
