import type { IconName } from '@/components/ui';

/**
 * Domain model.
 *
 * Three concepts are deliberately kept separate, because conflating them is the
 * easiest way to build the wrong product:
 *
 *   Protection        — is filtering on or off.
 *   Protection Lock   — the mechanism that makes turning it off hard.
 *                       Its strength is the "protection level" (1–4).
 *   Accountability    — an optional human layer: a trusted person is looped in.
 *
 * A user can run Protection ON + Lock: delay + Accountability: off, or
 * Protection ON + Lock: partner approval + Accountability: their spouse.
 */

export type ProtectionLevelId = 1 | 2 | 3 | 4;

/** The mechanism a Protection Lock uses. One per level. */
export type LockMethod = 'none' | 'pin' | 'delay' | 'partner';

export type ProtectionLevel = {
  id: ProtectionLevelId;
  method: LockMethod;
  /** "Normal", "Locked", … */
  name: string;
  /** One line under the name in the level picker. */
  tagline: string;
  /** What actually happens when the user tries to disable. */
  description: string;
  /** Shown as a strength meter: 1–4 filled bars. */
  strength: ProtectionLevelId;
};

export const PROTECTION_LEVELS: readonly ProtectionLevel[] = [
  {
    id: 1,
    method: 'none',
    name: 'Normal',
    tagline: 'Turn protection off any time',
    description:
      'Protection can be switched off immediately, with nothing standing in the way. Good for a first week while you settle in.',
    strength: 1,
  },
  {
    id: 2,
    method: 'pin',
    name: 'Locked',
    tagline: 'A PIN is required to turn it off',
    description:
      'Turning protection off asks for your PIN. Enough friction to stop an impulse, not enough to stop a determined moment.',
    strength: 2,
  },
  {
    id: 3,
    method: 'delay',
    name: 'Waiting period',
    tagline: 'Turning it off starts a countdown',
    description:
      'Protection stays on for a set waiting period after you ask to disable it. The urge usually passes before the timer does.',
    strength: 3,
  },
  {
    id: 4,
    method: 'partner',
    name: 'Accountability',
    tagline: 'Someone you trust has to approve',
    description:
      'Turning protection off sends a request to your accountability partner. It stays on until they approve.',
    strength: 4,
  },
] as const;

export type WaitingPeriodMinutes = 15 | 60 | 1440 | 2880;

/** The Protection Lock configuration itself. */
export type ProtectionLock = {
  level: ProtectionLevelId;
  /** Set when level 2 is in use. Stored here only because this is a prototype. */
  pin: string | null;
  /** Length of the countdown for level 3. */
  waitingPeriodMinutes: WaitingPeriodMinutes;
  /** Level 4 target. Null means the lock cannot be satisfied yet. */
  partnerId: string | null;
};

export type ProtectionCategoryId = 'adult-websites' | 'adult-apps' | 'adult-search' | 'gambling';

export type ProtectionCategory = {
  id: ProtectionCategoryId;
  title: string;
  description: string;
  /** Glyph name for the shared `<Icon>` component. */
  icon: IconName;
  /** Premium categories show a lock badge for free users. */
  premium: boolean;
};

export type DevicePlatform = 'ios' | 'android' | 'macos' | 'windows';

export type DeviceStatus = 'protected' | 'paused' | 'offline' | 'needs-setup';

export type Device = {
  id: string;
  name: string;
  platform: DevicePlatform;
  status: DeviceStatus;
  /** ISO timestamp. */
  lastSeen: string;
  /** True for the handset the app is running on. */
  isCurrent: boolean;
  /** Blocks in the last 7 days, for the device detail sparkline. */
  weeklyBlocks: number[];
};

export type PartnerStatus = 'active' | 'pending' | 'declined';

export type Partner = {
  id: string;
  name: string;
  /** "Wife", "Brother", "Mentor" — shown instead of a bare email. */
  relationship: string;
  email: string;
  status: PartnerStatus;
  /** ISO timestamp of the invite. */
  invitedAt: string;
  /** Avatar initials, derived at creation so the UI never has to parse names. */
  initials: string;
};

export type DisableRequestStatus = 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled';

/**
 * Why the request was raised. Turning protection off and merely weakening the
 * lock both have to clear the same barrier, but they must not have the same
 * effect when approved.
 */
export type DisableRequestIntent = 'disable' | 'lower-level';

/** A request to turn protection off, raised when the Protection Lock demands it. */
export type DisableRequest = {
  id: string;
  /** Which mechanism raised it. */
  method: Extract<LockMethod, 'delay' | 'partner'>;
  intent: DisableRequestIntent;
  /** The level being dropped to. Only set when `intent` is 'lower-level'. */
  targetLevel: ProtectionLevelId | null;
  status: DisableRequestStatus;
  /** Free text the user wrote. Shown to the partner verbatim. */
  reason: string;
  requestedAt: string;
  /** For 'delay': when the countdown ends. For 'partner': when it expires. */
  resolvesAt: string;
  partnerId: string | null;
};

/** What the partner sees in their inbox — the user's own pending items too. */
export type ApprovalSettings = {
  /** Partner is told when protection is disabled, even on lower levels. */
  notifyOnDisable: boolean;
  /** Partner is told when the protection level is lowered. */
  notifyOnLevelChange: boolean;
  /** Partner receives a weekly summary instead of individual events. */
  weeklyDigest: boolean;
  /** Partner can never see browsing history — surfaced in the UI as a promise. */
  shareActivityDetail: false;
};

export type PlanId = 'free' | 'premium';

export type BillingPeriod = 'monthly' | 'yearly';

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  features: { label: string; included: boolean }[];
};

export type Subscription = {
  plan: PlanId;
  period: BillingPeriod;
  /** ISO timestamp, null on the free plan. */
  renewsAt: string | null;
};

/**
 * Feed metadata. Held for the backend's benefit and deliberately NOT surfaced:
 * source names, domain counts and per-feed timestamps are implementation
 * detail, and showing them invites an audit no user can act on.
 */
export type BlocklistSource = {
  id: string;
  name: string;
  /** Domain count, shown rounded. */
  domains: number;
  /** ISO timestamp. */
  updatedAt: string;
};

export type Blocklist = {
  sources: BlocklistSource[];
  /** ISO timestamp of the last successful refresh across all sources. */
  lastCheckedAt: string;
  autoUpdate: boolean;
  /** Domains the user allowed through by hand (false positives). */
  allowed: string[];
  /** Domains the user added on top of the feeds. */
  blocked: string[];
};

export type BlockedScreenTheme = 'calm' | 'bold' | 'minimal';

/** What a person sees instead of a DNS error when a site is blocked. */
export type BlockedScreenConfig = {
  theme: BlockedScreenTheme;
  headline: string;
  message: string;
  /** Show a "message my partner" button on the block page. */
  showPartnerButton: boolean;
  /** Show a breathing exercise before the page can be dismissed. */
  showBreathingExercise: boolean;
};

export type NotificationSettings = {
  blockedAttempts: boolean;
  partnerActivity: boolean;
  weeklyReport: boolean;
  productUpdates: boolean;
};

export type User = {
  id: string;
  name: string;
  email: string;
  initials: string;
  /** ISO timestamp — drives "Protected for N days". */
  protectedSince: string;
};

export type OnboardingStep =
  | 'welcome'
  | 'create-account'
  | 'choose-protection'
  | 'register-device'
  | 'complete';
