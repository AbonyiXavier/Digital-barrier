/**
 * The rows every account must have from the moment it exists.
 *
 * Five tables hold exactly one row per user, and every read path treats them as
 * present: the dashboard reads `Protection`, the blocked screen reads its own
 * config, the paywall reads `Subscription`. Creating them lazily on first read
 * would mean every one of those call sites carrying a "or the defaults" branch,
 * and two of them disagreeing about what the defaults are. So they are created
 * once, with the account, from this single list.
 *
 * Every write is an upsert with an empty `update`, which makes the whole function
 * idempotent: safe to re-run for an account that predates it, and safe if the
 * signup hook is ever retried.
 */
import type { Prisma } from '../../generated/prisma/client';

/**
 * Defaults, kept identical to `prisma/seed.ts`. A seeded account and a freshly
 * signed-up one must be indistinguishable, or the app looks different against a
 * real database than it did against the prototype's store.
 */
export const USER_DEFAULTS = {
  protection: {
    /** Filtering is on from the first second; the point of the product. */
    protectionOn: true,
    /** No human is looped in until the user invites one. */
    accountabilityOn: false,
    /** 1 = no lock. Raising it is a deliberate act, never a default. */
    lockLevel: 1,
    /** 24h. One of the four values the migration's CHECK constraint allows. */
    waitingPeriodMinutes: 1440,
    enabledCategories: ['ADULT_WEBSITES', 'ADULT_APPS'],
  },
  approvalSettings: {
    notifyOnDisable: true,
    notifyOnLevelChange: true,
    weeklyDigest: false,
  },
  notificationSettings: {
    blockedAttempts: true,
    partnerActivity: true,
    weeklyReport: true,
    productUpdates: false,
  },
  blockedScreen: {
    theme: 'CALM',
    headline: 'Not this time.',
    message: 'You set this barrier up on a clearer day. That version of you is still right.',
    showPartnerButton: true,
    showBreathingExercise: true,
  },
  subscription: {
    plan: 'FREE',
    period: 'MONTHLY',
    /** FREE with a renewal date violates `subscription_renews_at_matches_plan`. */
    renewsAt: null,
  },
} as const;

/**
 * Creates a user's five singleton rows. Takes a transaction client so the caller
 * decides the atomicity boundary — the signup hook wraps all five in one
 * transaction, so an account never exists with three of them.
 */
export async function provisionUserSingletons(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.protection.upsert({
    where: { userId },
    create: { userId, ...USER_DEFAULTS.protection, enabledCategories: [...USER_DEFAULTS.protection.enabledCategories] },
    update: {},
  });
  await tx.approvalSettings.upsert({
    where: { userId },
    create: { userId, ...USER_DEFAULTS.approvalSettings },
    update: {},
  });
  await tx.notificationSettings.upsert({
    where: { userId },
    create: { userId, ...USER_DEFAULTS.notificationSettings },
    update: {},
  });
  await tx.blockedScreenConfig.upsert({
    where: { userId },
    create: { userId, ...USER_DEFAULTS.blockedScreen },
    update: {},
  });
  await tx.subscription.upsert({
    where: { userId },
    create: { userId, ...USER_DEFAULTS.subscription },
    update: {},
  });
}
