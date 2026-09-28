import { Inject, Injectable, Logger } from '@nestjs/common';

import { OUTBOX_EVENT } from '../outbox';
import { PartnerTokenService } from '../partners/partner-token.service';
import { PrismaService } from '../prisma';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationMessage,
} from './notification-channel';

export interface OutboxJobData {
  outboxId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly partnerTokens: PartnerTokenService,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: readonly NotificationChannel[],
  ) {}

  /**
   * Turns one outbox event into zero or more messages and delivers them.
   *
   * Everything beyond the ids in the payload is re-read from the database, so an
   * event that sat in the queue cannot deliver stale content. Unknown event types
   * are logged and acked — retrying them forever would only fill the DLQ with
   * something no retry can fix.
   */
  async handle(job: OutboxJobData): Promise<void> {
    const messages = await this.plan(job);
    if (messages.length === 0) return;

    for (const message of messages) {
      for (const channel of this.channels) {
        try {
          await channel.send(message);
        } catch (error) {
          // One channel failing must not stop the others; the throw below lets
          // BullMQ retry the whole job.
          this.logger.error(
            `channel ${channel.name} failed for ${message.kind}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          throw error;
        }
      }
    }
  }

  private async plan(job: OutboxJobData): Promise<NotificationMessage[]> {
    const { eventType, payload } = job;

    switch (eventType) {
      case OUTBOX_EVENT.PARTNER_INVITED:
        return this.partnerInvited(payload);
      case OUTBOX_EVENT.PARTNER_RESPONDED:
        return this.partnerResponded(payload);
      case OUTBOX_EVENT.REQUEST_CREATED:
        return this.requestCreated(payload);
      case OUTBOX_EVENT.REQUEST_APPROVED:
      case OUTBOX_EVENT.REQUEST_DECLINED:
      case OUTBOX_EVENT.REQUEST_EXPIRED:
        return this.requestResolved(eventType, payload);
      case OUTBOX_EVENT.PROTECTION_DISABLED:
        return this.protectionDisabled(payload);
      case OUTBOX_EVENT.PROTECTION_LEVEL_CHANGED:
        return this.protectionLevelChanged(payload);
      case OUTBOX_EVENT.FEED_REFRESH_FAILED:
        return this.feedFailed(payload);
      default:
        this.logger.warn(`no handler for outbox event "${eventType}"; acking`);
        return [];
    }
  }

  // --- partner-facing ------------------------------------------------------

  private async partnerInvited(payload: Record<string, unknown>): Promise<NotificationMessage[]> {
    const email = str(payload.email);
    const url = str(payload.url);
    const userId = str(payload.userId);
    if (email === undefined || url === undefined || userId === undefined) return [];

    const inviter = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const who = inviter?.name ?? 'Someone';

    // A partner sees who asked and what is being asked of them. Nothing about
    // browsing, devices or history — there is no field here that could carry it.
    return [
      {
        kind: 'partner-invite',
        email,
        subject: `${who} has asked you to be their accountability partner`,
        body:
          `${who} is using Aegis to block adult content, and has asked you to be the ` +
          `person who approves it when they want to turn that protection off.\n\n` +
          `You will never see their browsing history. You will see a request and the ` +
          `reason they wrote with it — nothing else.`,
        url,
      },
    ];
  }

  private async partnerResponded(payload: Record<string, unknown>): Promise<NotificationMessage[]> {
    const userId = str(payload.userId);
    const partnerId = str(payload.partnerId);
    if (userId === undefined || partnerId === undefined) return [];
    if (!(await this.wantsPartnerActivity(userId))) return [];

    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: { name: true, status: true },
    });
    if (!partner) return [];

    const accepted = partner.status === 'ACTIVE';
    return [
      {
        kind: 'partner-responded',
        userId,
        subject: accepted
          ? `${partner.name} accepted`
          : `${partner.name} declined the invitation`,
        body: accepted
          ? `${partner.name} can now approve requests to turn protection off.`
          : `${partner.name} has declined. You can invite someone else at any time.`,
      },
    ];
  }

  private async requestCreated(payload: Record<string, unknown>): Promise<NotificationMessage[]> {
    const requestId = str(payload.requestId) ?? str(payload.id);
    if (requestId === undefined) return [];

    const request = await this.prisma.disableRequest.findUnique({
      where: { id: requestId },
      select: {
        reason: true,
        method: true,
        expiresAt: true,
        user: { select: { name: true } },
        partner: { select: { id: true, email: true, name: true, inviteTokenHash: true } },
      },
    });
    // Only a partner request needs a human told; a delay just runs its clock down.
    if (!request || request.method !== 'PARTNER' || !request.partner?.email) return [];

    // A fresh link per request: the raw token is never stored (only its hash), so
    // it cannot be recovered from the invite, and a single-use link that outlived
    // one request would be a standing key to every future one.
    const { url } = await this.partnerTokens.issue(request.partner.id);
    const who = request.user.name;
    return [
      {
        kind: 'request-created',
        email: request.partner.email,
        subject: `${who} has asked to turn their protection off`,
        body:
          `${who} is asking you to approve turning off their content protection.\n\n` +
          `Their reason: "${request.reason}"\n\n` +
          `If you do nothing, the request lapses on its own.`,
        url,
      },
    ];
  }

  private async requestResolved(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationMessage[]> {
    const userId = str(payload.userId);
    if (userId === undefined) return [];

    const outcome =
      eventType === OUTBOX_EVENT.REQUEST_APPROVED
        ? 'approved'
        : eventType === OUTBOX_EVENT.REQUEST_DECLINED
          ? 'declined'
          : 'expired';

    return [
      {
        kind: 'request-resolved',
        userId,
        subject:
          outcome === 'approved'
            ? 'Your request was approved'
            : outcome === 'declined'
              ? 'Your request was declined'
              : 'Your request expired',
        body:
          outcome === 'expired'
            ? 'Nobody answered in time, so protection stayed on. You can ask again.'
            : `Your accountability partner ${outcome} your request.`,
      },
    ];
  }

  // --- user-facing ---------------------------------------------------------

  private async protectionDisabled(
    payload: Record<string, unknown>,
  ): Promise<NotificationMessage[]> {
    const userId = str(payload.userId);
    if (userId === undefined) return [];
    const partner = await this.partnerToNotify(userId, 'notifyOnDisable');
    if (partner === null) return [];

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return [
      {
        kind: 'protection-changed',
        email: partner.email,
        subject: `${user?.name ?? 'Your partner'} turned protection off`,
        body: 'They asked to be held to this. A short message from you may be worth more than the block was.',
      },
    ];
  }

  private async protectionLevelChanged(
    payload: Record<string, unknown>,
  ): Promise<NotificationMessage[]> {
    const userId = str(payload.userId);
    if (userId === undefined) return [];
    const partner = await this.partnerToNotify(userId, 'notifyOnLevelChange');
    if (partner === null) return [];

    const from = payload.from ?? payload.previousLevel;
    const to = payload.to ?? payload.level ?? payload.lockLevel;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return [
      {
        kind: 'protection-changed',
        email: partner.email,
        subject: `${user?.name ?? 'Your partner'} changed their protection level`,
        body:
          from !== undefined && to !== undefined
            ? `Their lock moved from level ${String(from)} to level ${String(to)}.`
            : 'Their protection lock level changed.',
      },
    ];
  }

  private async feedFailed(payload: Record<string, unknown>): Promise<NotificationMessage[]> {
    // Operational, not user-facing: a stale blocklist is our problem to fix, and
    // telling the user about it only erodes confidence they cannot act on.
    this.logger.error(
      `feed refresh failed: ${JSON.stringify({ feedId: payload.feedId, error: payload.error })}`,
    );
    return [];
  }

  // --- preference lookups --------------------------------------------------

  private async wantsPartnerActivity(userId: string): Promise<boolean> {
    const settings = await this.prisma.notificationSettings.findUnique({
      where: { userId },
      select: { partnerActivity: true },
    });
    return settings?.partnerActivity ?? true;
  }

  /**
   * The active approver, if this user has asked for them to be told about this
   * kind of event. A digest subscriber is deliberately skipped here — they get
   * the weekly summary instead of a message per event.
   */
  private async partnerToNotify(
    userId: string,
    flag: 'notifyOnDisable' | 'notifyOnLevelChange',
  ): Promise<{ email: string } | null> {
    const [approval, protection] = await Promise.all([
      this.prisma.approvalSettings.findUnique({ where: { userId } }),
      this.prisma.protection.findUnique({ where: { userId }, select: { partnerId: true } }),
    ]);
    if (approval !== null && approval[flag] === false) return null;
    if (approval?.weeklyDigest === true) return null;
    if (protection?.partnerId == null) return null;

    const partner = await this.prisma.partner.findFirst({
      where: { id: protection.partnerId, status: 'ACTIVE' },
      select: { email: true },
    });
    return partner ?? null;
  }
}
