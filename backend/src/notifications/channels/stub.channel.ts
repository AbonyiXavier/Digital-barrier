import { Injectable, Logger } from '@nestjs/common';

import type { NotificationChannel, NotificationMessage } from '../notification-channel';

/**
 * The default channel: logs instead of sending.
 *
 * Deliberately more than a no-op. It prints the full action URL, because the
 * partner magic link is the one thing you cannot test without either an email
 * provider or this. With it, the level-4 journey is walkable end to end on a
 * laptop with nothing configured.
 */
@Injectable()
export class StubChannel implements NotificationChannel {
  readonly name = 'stub' as const;
  private readonly logger = new Logger('Notify:stub');

  async send(message: NotificationMessage): Promise<void> {
    const to = message.email ?? (message.userId !== undefined ? `user:${message.userId}` : '?');
    this.logger.log(`[${message.kind}] to ${to} — ${message.subject}`);
    this.logger.log(`  ${message.body}`);
    if (message.url !== undefined) this.logger.log(`  link: ${message.url}`);
  }
}
