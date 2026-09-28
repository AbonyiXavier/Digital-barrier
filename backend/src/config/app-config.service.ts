import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env';

/**
 * Typed accessor over the validated environment. Injecting this instead of
 * `ConfigService` means no call site has to know a variable's name or type.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
  get port(): number {
    return this.get('PORT');
  }
  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS');
  }
  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }
  get redis(): { host: string; port: number } {
    return { host: this.get('REDIS_HOST'), port: this.get('REDIS_PORT') };
  }
  get authSecret(): string {
    return this.get('BETTER_AUTH_SECRET');
  }
  get authUrl(): string {
    return this.get('BETTER_AUTH_URL');
  }
  get partnerWebUrl(): string {
    return this.get('PARTNER_WEB_URL');
  }
  get notificationChannels(): Env['NOTIFICATION_CHANNELS'] {
    return this.get('NOTIFICATION_CHANNELS');
  }
  get smtpUrl(): string {
    return this.get('SMTP_URL');
  }
  get mailFrom(): string {
    return this.get('MAIL_FROM');
  }
  get expoAccessToken(): string {
    return this.get('EXPO_ACCESS_TOKEN');
  }
  /** How long a partner has to answer before a request lapses. */
  get partnerRequestWindowHours(): number {
    return this.get('PARTNER_REQUEST_WINDOW_HOURS');
  }
  get freePlanDeviceLimit(): number {
    return this.get('FREE_PLAN_DEVICE_LIMIT');
  }
  get deviceOfflineAfterMinutes(): number {
    return this.get('DEVICE_OFFLINE_AFTER_MINUTES');
  }
}
