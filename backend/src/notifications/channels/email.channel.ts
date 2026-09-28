import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { AppConfigService } from '../../config';
import type { NotificationChannel, NotificationMessage } from '../notification-channel';

/** SMTP delivery. Any provider that speaks SMTP works via a single URL. */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly name = 'email' as const;
  private readonly logger = new Logger('Notify:email');
  private transport: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  private get client(): Transporter | null {
    if (this.transport !== null) return this.transport;
    if (this.config.smtpUrl === '') return null;
    this.transport = createTransport(this.config.smtpUrl);
    return this.transport;
  }

  async send(message: NotificationMessage): Promise<void> {
    if (message.email === undefined) return; // not an email-shaped message
    const client = this.client;
    if (client === null) {
      // Misconfiguration must be loud but must not fail the job, or every
      // notification would retry five times and then dead-letter.
      this.logger.warn(
        `SMTP_URL is empty; not sending "${message.subject}" to ${message.email}`,
      );
      return;
    }
    const text =
      message.url !== undefined ? `${message.body}\n\n${message.url}\n` : `${message.body}\n`;
    await client.sendMail({
      from: this.config.mailFrom,
      to: message.email,
      subject: message.subject,
      text,
    });
  }
}
