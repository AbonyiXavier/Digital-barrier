/**
 * Defaults for the singleton rows a user owns.
 *
 * These mirror the column defaults in `schema.prisma`, with one addition: the
 * blocked screen's `headline` and `message` are `NOT NULL` with no default, so a
 * value has to come from somewhere. Rather than let a `PUT` that arrives before
 * the row exists fail on a missing column, the app's own copy is used as the
 * create-time fallback — the same strings the prototype shipped.
 *
 * They also make `GET /me/bootstrap` total: a client that calls it in the second
 * between sign-up and row creation gets a coherent state instead of a 500.
 */
import type { BlockedScreenTheme, ProtectionCategory } from '../../generated/prisma/client';

export const DEFAULT_PROTECTION = {
  protectionOn: true,
  accountabilityOn: false,
  lockLevel: 1,
  waitingPeriodMinutes: 1440,
  partnerId: null as string | null,
  enabledCategories: ['ADULT_WEBSITES', 'ADULT_APPS'] as ProtectionCategory[],
} as const;

export const DEFAULT_APPROVAL_SETTINGS = {
  notifyOnDisable: true,
  notifyOnLevelChange: true,
  weeklyDigest: false,
} as const;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  blockedAttempts: true,
  partnerActivity: true,
  weeklyReport: true,
  productUpdates: false,
} as const;

export const DEFAULT_BLOCKED_SCREEN = {
  theme: 'CALM' as BlockedScreenTheme,
  headline: 'Not this time.',
  message: 'You set this barrier up on a clearer day. That version of you is still right.',
  showPartnerButton: true,
  showBreathingExercise: true,
} as const;

export const DEFAULT_SUBSCRIPTION = {
  plan: 'FREE',
  period: 'MONTHLY',
  renewsAt: null,
} as const;

/**
 * `Blocklist.autoUpdate` has no column: feed refresh is a server-side scheduled
 * job that is not per-user switchable, so the only honest answer is the constant
 * the app reads.
 */
export const BLOCKLIST_AUTO_UPDATE = true;
