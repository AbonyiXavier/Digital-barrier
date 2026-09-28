/**
 * The bootstrap response: the mobile app's entire `AppState`, in one call.
 *
 * The app hydrates its reducer from this and nothing else, so the shape mirrors
 * `mobile/src/types/index.ts` field for field. Anything renamed here is a screen
 * that renders blank, which is why the conversions live in one mapper rather
 * than being improvised per field.
 *
 * Two fields are computed rather than stored (`initials`, `resolvesAt`), one is
 * a constant the database deliberately has no column for
 * (`approvalSettings.shareActivityDetail`), and one is deliberately absent
 * (`lock.pin` — the API exposes `pinSet` instead and the hash never leaves the
 * database).
 */
import type { CategoryId } from './api-mappers';

export interface BootstrapUser {
  id: string;
  name: string;
  email: string;
  /** Computed from `name`, never stored. */
  initials: string;
  /** ISO 8601 UTC. Null until onboarding completes. */
  protectedSince: string | null;
}

export interface BootstrapLock {
  level: number;
  /**
   * Whether a PIN exists. The hash is never returned by any endpoint, and there
   * is no field here that could carry it.
   */
  pinSet: boolean;
  waitingPeriodMinutes: number;
  partnerId: string | null;
}

export interface BootstrapDevice {
  id: string;
  name: string;
  platform: 'ios' | 'android' | 'macos' | 'windows';
  status: 'protected' | 'paused' | 'offline' | 'needs-setup';
  /** ISO 8601 UTC. */
  lastSeen: string;
  /** Computed by comparing `installId` to the caller's `x-install-id` header. */
  isCurrent: boolean;
  /** Length 7, oldest first, index 6 = today. */
  weeklyBlocks: number[];
}

export interface BootstrapPartner {
  id: string;
  name: string;
  relationship: string;
  email: string;
  status: 'active' | 'pending' | 'declined';
  invitedAt: string;
  /** Computed from `name`, never stored. */
  initials: string;
}

export interface BootstrapApprovalSettings {
  notifyOnDisable: boolean;
  notifyOnLevelChange: boolean;
  weeklyDigest: boolean;
  /**
   * A literal constant, not a setting. The app calls this "not a setting — a
   * guarantee", so there is no column behind it: a column would imply it could
   * be switched on, and `PUT /settings/approval` rejects any attempt to send it.
   */
  shareActivityDetail: false;
}

export interface BootstrapRequest {
  id: string;
  method: 'delay' | 'partner';
  intent: 'disable' | 'lower-level';
  targetLevel: number | null;
  status: 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled';
  reason: string;
  requestedAt: string;
  /**
   * `readyAt ?? expiresAt`.
   *
   * The database keeps these apart on purpose — a countdown's end is not an
   * expiry deadline, and only one of them applies to any given request — but the
   * client shows a single "resolves at" moment, so the two collapse here.
   */
  resolvesAt: string | null;
  partnerId: string | null;
}

export interface BootstrapSubscription {
  plan: 'free' | 'premium';
  period: 'monthly' | 'yearly';
  /** ISO 8601 UTC. Null on the free plan, enforced by a database constraint. */
  renewsAt: string | null;
}

export interface BootstrapBlocklist {
  sources: { id: string; name: string; domains: number; updatedAt: string }[];
  lastCheckedAt: string | null;
  /**
   * No column exists for this. Reported as a constant `true` because the refresh
   * job is unconditional; see the module notes.
   */
  autoUpdate: boolean;
  allowed: string[];
  blocked: string[];
}

export interface BootstrapBlockedScreen {
  theme: 'calm' | 'bold' | 'minimal';
  headline: string;
  message: string;
  showPartnerButton: boolean;
  showBreathingExercise: boolean;
}

export interface BootstrapNotificationSettings {
  blockedAttempts: boolean;
  partnerActivity: boolean;
  weeklyReport: boolean;
  productUpdates: boolean;
}

export interface BootstrapResponse {
  /** Derived from `User.protectedSince`, which onboarding sets. No flag column. */
  onboarded: boolean;
  user: BootstrapUser;
  protectionOn: boolean;
  lock: BootstrapLock;
  enabledCategories: CategoryId[];
  devices: BootstrapDevice[];
  partners: BootstrapPartner[];
  accountabilityOn: boolean;
  approvalSettings: BootstrapApprovalSettings;
  requests: BootstrapRequest[];
  subscription: BootstrapSubscription;
  blocklist: BootstrapBlocklist;
  blockedScreen: BootstrapBlockedScreen;
  notifications: BootstrapNotificationSettings;
  /** Sum across every device. Length 7, oldest first, index 6 = today. */
  weeklyBlocks: number[];
  blocksToday: number;
}
