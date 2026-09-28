import { ForbiddenException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma';
import { toThemeId, toTheme } from '../users/api-mappers';
import type {
  UpdateApprovalSettingsDto,
  UpdateBlockedScreenDto,
  UpdateNotificationSettingsDto,
} from './dto';

export interface NotificationSettingsView {
  blockedAttempts: boolean;
  partnerActivity: boolean;
  weeklyReport: boolean;
  productUpdates: boolean;
}

export interface ApprovalSettingsView {
  notifyOnDisable: boolean;
  notifyOnLevelChange: boolean;
  weeklyDigest: boolean;
  /**
   * Always false, and not stored.
   *
   * The app renders this as a permanently-disabled toggle captioned "Never
   * shared. Not a setting — a guarantee." Returning a constant keeps that promise
   * expressible in the API without creating a value that could ever be written.
   */
  shareActivityDetail: false;
}

export interface BlockedScreenView {
  theme: 'calm' | 'bold' | 'minimal';
  headline: string;
  message: string;
  showPartnerButton: boolean;
  showBreathingExercise: boolean;
}

/** Fields of the blocked screen that the free plan may not change. */
const PREMIUM_BLOCKED_SCREEN_FIELDS = [
  'headline',
  'message',
  'showPartnerButton',
  'showBreathingExercise',
] as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- notifications -------------------------------------------------------

  async readNotifications(userId: string): Promise<NotificationSettingsView> {
    const row = await this.prisma.notificationSettings.findUnique({ where: { userId } });
    return {
      blockedAttempts: row?.blockedAttempts ?? true,
      partnerActivity: row?.partnerActivity ?? true,
      weeklyReport: row?.weeklyReport ?? true,
      productUpdates: row?.productUpdates ?? false,
    };
  }

  async updateNotifications(
    userId: string,
    patch: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsView> {
    const row = await this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    });
    return {
      blockedAttempts: row.blockedAttempts,
      partnerActivity: row.partnerActivity,
      weeklyReport: row.weeklyReport,
      productUpdates: row.productUpdates,
    };
  }

  // --- approval ------------------------------------------------------------

  async readApproval(userId: string): Promise<ApprovalSettingsView> {
    const row = await this.prisma.approvalSettings.findUnique({ where: { userId } });
    return {
      notifyOnDisable: row?.notifyOnDisable ?? true,
      notifyOnLevelChange: row?.notifyOnLevelChange ?? true,
      weeklyDigest: row?.weeklyDigest ?? false,
      shareActivityDetail: false,
    };
  }

  async updateApproval(
    userId: string,
    patch: UpdateApprovalSettingsDto,
  ): Promise<ApprovalSettingsView> {
    // The DTO rejects shareActivityDetail outright, so it cannot reach here; strip
    // it regardless so a future DTO change cannot turn it into a stored column.
    const { shareActivityDetail: _ignored, ...writable } = patch;
    const row = await this.prisma.approvalSettings.upsert({
      where: { userId },
      create: { userId, ...writable },
      update: writable,
    });
    return {
      notifyOnDisable: row.notifyOnDisable,
      notifyOnLevelChange: row.notifyOnLevelChange,
      weeklyDigest: row.weeklyDigest,
      shareActivityDetail: false,
    };
  }

  // --- blocked screen ------------------------------------------------------

  async readBlockedScreen(userId: string): Promise<BlockedScreenView> {
    const row = await this.prisma.blockedScreenConfig.findUnique({ where: { userId } });
    return {
      theme: row ? toThemeId(row.theme) : 'calm',
      headline: row?.headline ?? 'Not this time.',
      message:
        row?.message ??
        'You set this barrier up on a clearer day. That version of you is still right.',
      showPartnerButton: row?.showPartnerButton ?? true,
      showBreathingExercise: row?.showBreathingExercise ?? true,
    };
  }

  /**
   * The premium split here is narrower than it looks: the app gates the wording
   * and the on-page toggles, but leaves the *theme* free — "those stay free to
   * look at". So a free user may restyle the page and not rewrite it.
   */
  async updateBlockedScreen(
    userId: string,
    patch: UpdateBlockedScreenDto,
  ): Promise<BlockedScreenView> {
    const touchedPremium = PREMIUM_BLOCKED_SCREEN_FIELDS.filter(
      (field) => patch[field] !== undefined,
    );
    if (touchedPremium.length > 0) {
      const subscription = await this.prisma.subscription.findUnique({ where: { userId } });
      if (subscription?.plan !== 'PREMIUM') {
        throw new ForbiddenException({
          code: 'PREMIUM_REQUIRED',
          message: 'Customising the words on your blocked screen is a Premium feature.',
          details: { fields: touchedPremium },
        });
      }
    }

    const { theme, ...rest } = patch;
    const data = { ...rest, ...(theme !== undefined ? { theme: toTheme(theme) } : {}) };

    const row = await this.prisma.blockedScreenConfig.upsert({
      where: { userId },
      create: {
        userId,
        headline: 'Not this time.',
        message:
          'You set this barrier up on a clearer day. That version of you is still right.',
        ...data,
      },
      update: data,
    });
    return {
      theme: toThemeId(row.theme),
      headline: row.headline,
      message: row.message,
      showPartnerButton: row.showPartnerButton,
      showBreathingExercise: row.showBreathingExercise,
    };
  }
}
