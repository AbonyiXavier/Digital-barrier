import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { BlocklistModule } from './blocklist/blocklist.module';
import { RequestIdMiddleware } from './common';
import { ConfigModule } from './config';
import { DevicesModule } from './devices/devices.module';
import { FeedsModule } from './feeds/feeds.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OutboxModule } from './outbox';
import { PartnersModule } from './partners/partners.module';
import { PrismaModule } from './prisma';
import { ProtectionModule } from './protection/protection.module';
import { QueuesModule } from './queues';
import { RequestsModule } from './requests/requests.module';
import { SettingsModule } from './settings/settings.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    QueuesModule,
    OutboxModule,
    ScheduleModule.forRoot(),
    // A blunt default so a stolen session cannot be used to hammer the API.
    // Endpoints that need a tighter limit (PIN verification, partner tokens)
    // override it with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    AuthModule,
    UsersModule,
    ProtectionModule,
    DevicesModule,
    PartnersModule,
    RequestsModule,
    BlocklistModule,
    FeedsModule,
    SubscriptionModule,
    SettingsModule,
    MetricsModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
