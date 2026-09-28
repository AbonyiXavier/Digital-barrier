import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { DevicePlatform, Prisma } from '../../generated/prisma/client';
import { MetricsService, zeroWindow } from '../metrics';
import { PrismaService } from '../prisma';
import {
  iso,
  isoOrNull,
  initialsOf,
  toCategory,
  toCategoryId,
  toDeviceStatusId,
  toPartnerStatusId,
  toPeriodId,
  toPlanId,
  toPlatformId,
  toRequestIntentId,
  toRequestMethodId,
  toRequestStatusId,
  toThemeId,
  type CategoryId,
} from './api-mappers';
import type {
  BootstrapBlocklist,
  BootstrapResponse,
  BootstrapUser,
} from './bootstrap.types';
import {
  BLOCKLIST_AUTO_UPDATE,
  DEFAULT_APPROVAL_SETTINGS,
  DEFAULT_BLOCKED_SCREEN,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_PROTECTION,
  DEFAULT_SUBSCRIPTION,
} from './defaults';
import { USER_EVENT } from './user-events';

/** What onboarding reports back; the client already holds the rest. */
export interface OnboardingResult {
  onboarded: true;
  user: BootstrapUser;
  protectionOn: boolean;
  enabledCategories: CategoryId[];
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  // -------------------------------------------------------------------------
  // GET /me/bootstrap
  // -------------------------------------------------------------------------

  /**
   * The whole client state, read straight from the database.
   *
   * One endpoint rather than fourteen because the app's reducer is hydrated
   * atomically: a dashboard assembled from ten parallel calls can render a
   * protection state from one response and a lock level from another, which is
   * precisely the inconsistency this product cannot afford. Everything here
   * comes from a single consistent read path, and nothing is fetched through
   * another module's service — the data is read directly so this endpoint cannot
   * be broken by a change in someone else's HTTP layer.
   *
   * @param installId The caller's `x-install-id`, used to compute `isCurrent`.
   */
  async bootstrap(userId: string, installId?: string): Promise<BootstrapResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        protection: true,
        approvalSettings: true,
        notificationSettings: true,
        blockedScreen: true,
        subscription: true,
        devices: { orderBy: { createdAt: 'asc' } },
        partners: { orderBy: { createdAt: 'asc' } },
        // Newest first: the app prepends new requests and shows the latest.
        requests: { orderBy: { requestedAt: 'desc' } },
        rules: { orderBy: { domain: 'asc' } },
      },
    });
    if (!user) throw this.missing();

    const [blocks, blocklistFeeds] = await Promise.all([
      this.metrics.blockWindow(userId),
      this.readFeeds(),
    ]);

    const protection = user.protection ?? DEFAULT_PROTECTION;
    const approval = user.approvalSettings ?? DEFAULT_APPROVAL_SETTINGS;
    const notifications = user.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;
    const blockedScreen = user.blockedScreen ?? DEFAULT_BLOCKED_SCREEN;
    const subscription = user.subscription ?? DEFAULT_SUBSCRIPTION;

    const perDevice = new Map(
      blocks.perDevice.map((entry) => [entry.deviceId, entry.weeklyBlocks]),
    );

    return {
      // No `onboarded` column exists. `protectedSince` is set exactly once, by
      // onboarding, and is what drives "protected for N days" — so it is already
      // the fact a flag would duplicate.
      onboarded: user.protectedSince !== null,
      user: this.toBootstrapUser(user),
      protectionOn: protection.protectionOn,
      lock: {
        level: protection.lockLevel,
        // `pinHash` is read to answer one boolean and is not part of the
        // response type, so there is no route by which it could be serialised.
        pinSet: 'pinHash' in protection ? protection.pinHash !== null : false,
        waitingPeriodMinutes: protection.waitingPeriodMinutes,
        partnerId: protection.partnerId,
      },
      enabledCategories: protection.enabledCategories.map(toCategoryId),
      devices: user.devices.map((device) => ({
        id: device.id,
        name: device.name,
        platform: toPlatformId(device.platform),
        status: toDeviceStatusId(device.status),
        lastSeen: iso(device.lastSeenAt),
        // A property of the request, not of the device: which handset is "this
        // one" depends on who is asking, so it is computed and never stored.
        isCurrent:
          installId !== undefined && device.installId !== null && device.installId === installId,
        weeklyBlocks: perDevice.get(device.id) ?? zeroWindow(),
      })),
      partners: user.partners.map((partner) => ({
        id: partner.id,
        name: partner.name,
        relationship: partner.relationship,
        email: partner.email,
        status: toPartnerStatusId(partner.status),
        invitedAt: iso(partner.invitedAt),
        initials: initialsOf(partner.name),
      })),
      accountabilityOn: protection.accountabilityOn,
      approvalSettings: {
        notifyOnDisable: approval.notifyOnDisable,
        notifyOnLevelChange: approval.notifyOnLevelChange,
        weeklyDigest: approval.weeklyDigest,
        // A literal constant. Not a column, not configurable, by design.
        shareActivityDetail: false,
      },
      requests: user.requests.map((request) => ({
        id: request.id,
        method: toRequestMethodId(request.method),
        intent: toRequestIntentId(request.intent),
        targetLevel: request.targetLevel,
        status: toRequestStatusId(request.status),
        reason: request.reason,
        requestedAt: iso(request.requestedAt),
        // The two columns exist because a countdown's end and an expiry deadline
        // are different facts; only one is ever set, and the client wants one
        // field, so they collapse here rather than in the schema.
        resolvesAt: isoOrNull(request.readyAt ?? request.expiresAt),
        partnerId: request.partnerId,
      })),
      subscription: {
        plan: toPlanId(subscription.plan),
        period: toPeriodId(subscription.period),
        renewsAt: isoOrNull(subscription.renewsAt),
      },
      blocklist: {
        ...blocklistFeeds,
        allowed: user.rules.filter((rule) => rule.list === 'ALLOW').map((rule) => rule.domain),
        blocked: user.rules.filter((rule) => rule.list === 'BLOCK').map((rule) => rule.domain),
      },
      blockedScreen: {
        theme: toThemeId(blockedScreen.theme),
        headline: blockedScreen.headline,
        message: blockedScreen.message,
        showPartnerButton: blockedScreen.showPartnerButton,
        showBreathingExercise: blockedScreen.showBreathingExercise,
      },
      notifications: {
        blockedAttempts: notifications.blockedAttempts,
        partnerActivity: notifications.partnerActivity,
        weeklyReport: notifications.weeklyReport,
        productUpdates: notifications.productUpdates,
      },
      weeklyBlocks: blocks.weeklyBlocks,
      blocksToday: blocks.blocksToday,
    };
  }

  /**
   * Feed metadata for the blocklist screen. Read directly, because the feeds
   * module's service is written in parallel and importing it would couple this
   * endpoint's availability to another module's boot order.
   */
  private async readFeeds(): Promise<Omit<BootstrapBlocklist, 'allowed' | 'blocked'>> {
    const [feeds, lastOk] = await Promise.all([
      this.prisma.feed.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
        include: {
          versions: {
            orderBy: { fetchedAt: 'desc' },
            take: 1,
            select: { entries: true, fetchedAt: true },
          },
        },
      }),
      this.prisma.feedRefreshAttempt.findFirst({
        where: { ok: true },
        orderBy: { at: 'desc' },
        select: { at: true },
      }),
    ]);

    return {
      sources: feeds.map((feed) => {
        const latest = feed.versions[0];
        return {
          id: feed.id,
          name: feed.name,
          // Zero until the refresh job has published a version. Honest: a count
          // with no artifact behind it would be a number the screen cannot back.
          domains: latest?.entries ?? 0,
          updatedAt: iso(latest?.fetchedAt ?? feed.updatedAt),
        };
      }),
      lastCheckedAt: isoOrNull(lastOk?.at),
      autoUpdate: BLOCKLIST_AUTO_UPDATE,
    };
  }

  // -------------------------------------------------------------------------
  // POST /me/onboarding
  // -------------------------------------------------------------------------

  /**
   * Completes onboarding.
   *
   * Idempotent, and deliberately so in a specific way: a second call does not
   * move `protectedSince`. That timestamp is the whole basis of "protected for N
   * days", and resetting it on a retried request would quietly erase the streak
   * the user is being congratulated for.
   */
  async completeOnboarding(userId: string, categories: CategoryId[]): Promise<OnboardingResult> {
    const enabled = [...new Set(categories)].map(toCategory);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id: userId },
        select: { protectedSince: true },
      });
      if (!existing) throw this.missing();

      const user = await tx.user.update({
        where: { id: userId },
        data: { protectedSince: existing.protectedSince ?? new Date() },
      });

      // Protection is forced on: finishing onboarding is the act of switching it
      // on, and a "protected" account with filtering off is the one state this
      // product must never present.
      const protection = await tx.protection.upsert({
        where: { userId },
        create: { userId, protectionOn: true, enabledCategories: enabled },
        update: { protectionOn: true, enabledCategories: enabled },
      });

      return {
        onboarded: true as const,
        user: this.toBootstrapUser(user),
        protectionOn: protection.protectionOn,
        enabledCategories: protection.enabledCategories.map(toCategoryId),
      };
    });
  }

  // -------------------------------------------------------------------------
  // PATCH /me
  // -------------------------------------------------------------------------

  async updateProfile(
    userId: string,
    patch: { name?: string; email?: string },
  ): Promise<BootstrapUser> {
    const data: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.email !== undefined) {
      // Changing the address unverifies it. Better Auth owns re-verification;
      // what matters here is not leaving `emailVerified` true for an address
      // nobody has proved they can read.
      data.email = patch.email.trim().toLowerCase();
      data.emailVerified = false;
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return this.toBootstrapUser(user);
  }

  // -------------------------------------------------------------------------
  // DELETE /me
  // -------------------------------------------------------------------------

  /**
   * Deletes the account, for real.
   *
   * The privacy screen promises this and the prototype refused to do it. Every
   * child relation declares `onDelete: Cascade`, so one delete takes the
   * protection row, the devices and their block counts, the partners, the
   * requests, the rules, the push tokens and the sessions with it. Outbox rows
   * are not user-scoped and are left alone; they name an aggregate id, never a
   * person's data.
   */
  async deleteAccount(userId: string): Promise<void> {
    // `deleteMany` rather than `delete`: a retried delete on an account that is
    // already gone should not surface as a Prisma "record not found" crash.
    const result = await this.prisma.user.deleteMany({ where: { id: userId } });
    if (result.count === 0) throw this.missing();
    this.logger.log(`account ${userId} deleted`);
  }

  // -------------------------------------------------------------------------
  // POST /me/export
  // -------------------------------------------------------------------------

  /**
   * Requests a data export.
   *
   * Accepted, not performed: the app promises "your file is emailed within an
   * hour", which is a job, not a response body. An outbox row is written so the
   * promise survives a crash between the request and the delivery, and the
   * notifications consumer sends it.
   *
   * The row is written with `tx.outbox.create` rather than `OutboxService.emit`
   * because `OUTBOX_EVENT` has no member for this event and that file is not
   * ours to change.
   */
  async requestExport(userId: string): Promise<{ status: 'accepted'; requestedAt: string }> {
    const requestedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw this.missing();

      await tx.outbox.create({
        data: {
          aggregateType: 'user',
          aggregateId: userId,
          eventType: USER_EVENT.EXPORT_REQUESTED,
          payload: { userId, requestedAt: iso(requestedAt) },
        },
      });
    });

    return { status: 'accepted', requestedAt: iso(requestedAt) };
  }

  // -------------------------------------------------------------------------
  // POST /me/push-token
  // -------------------------------------------------------------------------

  /**
   * Registers a push token.
   *
   * Upserted on the token itself, which is unique globally: the same handset
   * re-registering must not accumulate rows, and a token that has moved to
   * another account must follow it rather than deliver that account's
   * notifications to the previous owner.
   */
  async savePushToken(
    userId: string,
    token: string,
    platform: DevicePlatform,
  ): Promise<{ registered: true }> {
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { registered: true };
  }

  // -------------------------------------------------------------------------

  private toBootstrapUser(user: {
    id: string;
    name: string;
    email: string;
    protectedSince: Date | null;
  }): BootstrapUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: initialsOf(user.name),
      protectedSince: isoOrNull(user.protectedSince),
    };
  }

  private missing(): NotFoundException {
    return new NotFoundException({ code: 'NOT_FOUND', message: 'Account not found.' });
  }
}
