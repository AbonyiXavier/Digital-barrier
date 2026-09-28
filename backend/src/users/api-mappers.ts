/**
 * The single place the database's vocabulary is translated into the client's.
 *
 * Postgres enums are SCREAMING_SNAKE; the mobile app's types are lowercase and
 * kebab-cased (`needs-setup`, `lower-level`, `adult-websites`). Both spellings
 * are right for where they live, so the conversion is centralised here rather
 * than open-coded per endpoint — one table to be wrong in, not twelve.
 *
 * It lives in `users/` because `GET /me/bootstrap` returns the entire client
 * state and therefore touches every one of these enums; the subscription and
 * settings modules import the two or three they need from here.
 */
import type {
  BillingPeriod,
  BlockedScreenTheme,
  DevicePlatform,
  DeviceStatus,
  PartnerStatus,
  PlanId,
  ProtectionCategory,
  RequestIntent,
  RequestMethod,
  RequestStatus,
} from '../../generated/prisma/client';

export type CategoryId = 'adult-websites' | 'adult-apps' | 'adult-search' | 'gambling';

const CATEGORY_TO_ID: Record<ProtectionCategory, CategoryId> = {
  ADULT_WEBSITES: 'adult-websites',
  ADULT_APPS: 'adult-apps',
  ADULT_SEARCH: 'adult-search',
  GAMBLING: 'gambling',
};

const ID_TO_CATEGORY: Record<CategoryId, ProtectionCategory> = {
  'adult-websites': 'ADULT_WEBSITES',
  'adult-apps': 'ADULT_APPS',
  'adult-search': 'ADULT_SEARCH',
  gambling: 'GAMBLING',
};

/** Every category id the client may send, in the app's own order. */
export const CATEGORY_IDS: readonly CategoryId[] = [
  'adult-websites',
  'adult-apps',
  'adult-search',
  'gambling',
];

export const toCategoryId = (value: ProtectionCategory): CategoryId => CATEGORY_TO_ID[value];
export const toCategory = (value: CategoryId): ProtectionCategory => ID_TO_CATEGORY[value];

export const isCategoryId = (value: unknown): value is CategoryId =>
  typeof value === 'string' && value in ID_TO_CATEGORY;

const PLATFORM_TO_ID: Record<DevicePlatform, 'ios' | 'android' | 'macos' | 'windows'> = {
  IOS: 'ios',
  ANDROID: 'android',
  MACOS: 'macos',
  WINDOWS: 'windows',
};
export const toPlatformId = (value: DevicePlatform): 'ios' | 'android' | 'macos' | 'windows' =>
  PLATFORM_TO_ID[value];

const DEVICE_STATUS_TO_ID: Record<
  DeviceStatus,
  'protected' | 'paused' | 'offline' | 'needs-setup'
> = {
  PROTECTED: 'protected',
  PAUSED: 'paused',
  OFFLINE: 'offline',
  NEEDS_SETUP: 'needs-setup',
};
export const toDeviceStatusId = (
  value: DeviceStatus,
): 'protected' | 'paused' | 'offline' | 'needs-setup' => DEVICE_STATUS_TO_ID[value];

const PARTNER_STATUS_TO_ID: Record<PartnerStatus, 'active' | 'pending' | 'declined'> = {
  ACTIVE: 'active',
  PENDING: 'pending',
  DECLINED: 'declined',
};
export const toPartnerStatusId = (value: PartnerStatus): 'active' | 'pending' | 'declined' =>
  PARTNER_STATUS_TO_ID[value];

const REQUEST_METHOD_TO_ID: Record<RequestMethod, 'delay' | 'partner'> = {
  DELAY: 'delay',
  PARTNER: 'partner',
};
export const toRequestMethodId = (value: RequestMethod): 'delay' | 'partner' =>
  REQUEST_METHOD_TO_ID[value];

const REQUEST_INTENT_TO_ID: Record<RequestIntent, 'disable' | 'lower-level'> = {
  DISABLE: 'disable',
  LOWER_LEVEL: 'lower-level',
};
export const toRequestIntentId = (value: RequestIntent): 'disable' | 'lower-level' =>
  REQUEST_INTENT_TO_ID[value];

const REQUEST_STATUS_TO_ID: Record<
  RequestStatus,
  'pending' | 'approved' | 'declined' | 'expired' | 'cancelled'
> = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};
export const toRequestStatusId = (
  value: RequestStatus,
): 'pending' | 'approved' | 'declined' | 'expired' | 'cancelled' => REQUEST_STATUS_TO_ID[value];

const PLAN_TO_ID: Record<PlanId, 'free' | 'premium'> = { FREE: 'free', PREMIUM: 'premium' };
export const toPlanId = (value: PlanId): 'free' | 'premium' => PLAN_TO_ID[value];
export const toPlan = (value: 'free' | 'premium'): PlanId =>
  value === 'premium' ? 'PREMIUM' : 'FREE';

const PERIOD_TO_ID: Record<BillingPeriod, 'monthly' | 'yearly'> = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
};
export const toPeriodId = (value: BillingPeriod): 'monthly' | 'yearly' => PERIOD_TO_ID[value];
export const toPeriod = (value: 'monthly' | 'yearly'): BillingPeriod =>
  value === 'yearly' ? 'YEARLY' : 'MONTHLY';

const THEME_TO_ID: Record<BlockedScreenTheme, 'calm' | 'bold' | 'minimal'> = {
  CALM: 'calm',
  BOLD: 'bold',
  MINIMAL: 'minimal',
};
export const toThemeId = (value: BlockedScreenTheme): 'calm' | 'bold' | 'minimal' =>
  THEME_TO_ID[value];
export const toTheme = (value: 'calm' | 'bold' | 'minimal'): BlockedScreenTheme =>
  value === 'bold' ? 'BOLD' : value === 'minimal' ? 'MINIMAL' : 'CALM';

/**
 * Avatar initials: the first letter of the first two whitespace-separated name
 * tokens, uppercased.
 *
 * Computed, never stored. The prototype derived these once at creation and kept
 * them, which meant renaming a partner left the old initials on their avatar.
 */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * ISO 8601 UTC, always. Nothing here is ever pre-formatted for display: "3
 * hours ago" depends on the reader's clock and locale, which the server does not
 * have.
 */
export const iso = (value: Date): string => value.toISOString();
export const isoOrNull = (value: Date | null | undefined): string | null =>
  value == null ? null : value.toISOString();
