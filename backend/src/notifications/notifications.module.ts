import { Module } from '@nestjs/common';

import { AppConfigService } from '../config';
import { PartnersModule } from '../partners/partners.module';
import { EmailChannel } from './channels/email.channel';
import { PushChannel } from './channels/push.channel';
import { StubChannel } from './channels/stub.channel';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './notification-channel';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';
import { WeeklyDigestService } from './weekly-digest.service';

@Module({
  imports: [PartnersModule],
  providers: [
    StubChannel,
    EmailChannel,
    PushChannel,
    {
      // Which adapters are live is config, so a deployment can go from logging to
      // real email without a code change — and local development needs no
      // credentials at all.
      provide: NOTIFICATION_CHANNELS,
      inject: [AppConfigService, StubChannel, EmailChannel, PushChannel],
      useFactory: (
        config: AppConfigService,
        stub: StubChannel,
        email: EmailChannel,
        push: PushChannel,
      ): readonly NotificationChannel[] => {
        const available = { stub, email, push } as const;
        return config.notificationChannels.map((name) => available[name]);
      },
    },
    NotificationsService,
    NotificationsProcessor,
    WeeklyDigestService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
