/**
 * Hydrating the store from the API.
 *
 * `GET /me/bootstrap` returns the whole app state in one call, which is why the
 * store can still hydrate with a single dispatch exactly as it did from
 * AsyncStorage — screens never learn that the source changed.
 *
 * The payload is validated rather than trusted. The reducer's `hydrate` case
 * blind-spreads whatever it is given; that was harmless when the only writer was
 * our own `setItem`, and is a trust boundary now that it comes off the network.
 */
import type {
  ApprovalSettings,
  Blocklist,
  BlockedScreenConfig,
  Device,
  DisableRequest,
  NotificationSettings,
  Partner,
  ProtectionCategoryId,
  ProtectionLock,
  Subscription,
  User,
} from '@/types';

import { api } from './client';

/** The slice of AppState the server owns. */
export interface BootstrapState {
  onboarded: boolean;
  user: User | null;
  protectionOn: boolean;
  lock: ProtectionLock;
  enabledCategories: ProtectionCategoryId[];
  devices: Device[];
  partners: Partner[];
  accountabilityOn: boolean;
  approvalSettings: ApprovalSettings;
  requests: DisableRequest[];
  subscription: Subscription;
  blocklist: Blocklist;
  blockedScreen: BlockedScreenConfig;
  notifications: NotificationSettings;
  weeklyBlocks: number[];
  blocksToday: number;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const asBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Seven numbers, oldest first, index 6 being today. */
function asWeek(value: unknown): number[] {
  const week = asArray<unknown>(value)
    .map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0))
    .slice(-7);
  return [...new Array<number>(Math.max(0, 7 - week.length)).fill(0), ...week];
}

export class BootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapError';
  }
}

/**
 * The PIN never leaves the server — the API sends `pinSet` instead of a value,
 * and the reducer's `lock.pin` becomes a marker rather than a secret. Anything
 * comparing it to a typed PIN would be wrong, and `POST /protection/pin/verify`
 * is the only correct check.
 */
function toLock(raw: unknown): ProtectionLock {
  const lock = isObject(raw) ? raw : {};
  const level = Number(lock.level);
  const minutes = Number(lock.waitingPeriodMinutes);
  return {
    level: ([1, 2, 3, 4].includes(level) ? level : 1) as ProtectionLock['level'],
    pin: lock.pinSet === true ? '' : null,
    waitingPeriodMinutes: ([15, 60, 1440, 2880].includes(minutes)
      ? minutes
      : 1440) as ProtectionLock['waitingPeriodMinutes'],
    partnerId: typeof lock.partnerId === 'string' ? lock.partnerId : null,
  };
}

export function parseBootstrap(payload: unknown): BootstrapState {
  if (!isObject(payload)) throw new BootstrapError('Unexpected response from the server.');

  const user = isObject(payload.user) ? (payload.user as unknown as User) : null;
  if (user !== null && typeof user.id !== 'string') {
    throw new BootstrapError('The server sent a user without an id.');
  }

  const blocklist = isObject(payload.blocklist) ? payload.blocklist : {};
  const subscription = isObject(payload.subscription) ? payload.subscription : {};

  return {
    onboarded: asBool(payload.onboarded, false),
    user,
    protectionOn: asBool(payload.protectionOn, true),
    lock: toLock(payload.lock),
    enabledCategories: asArray<ProtectionCategoryId>(payload.enabledCategories),
    devices: asArray<Device>(payload.devices),
    partners: asArray<Partner>(payload.partners),
    accountabilityOn: asBool(payload.accountabilityOn, false),
    approvalSettings: {
      ...(isObject(payload.approvalSettings) ? payload.approvalSettings : {}),
      // Never taken from the wire: the app states this is a guarantee, not a
      // setting, and the type makes `true` unrepresentable.
      shareActivityDetail: false,
    } as ApprovalSettings,
    requests: asArray<DisableRequest>(payload.requests),
    subscription: {
      plan: subscription.plan === 'premium' ? 'premium' : 'free',
      period: subscription.period === 'yearly' ? 'yearly' : 'monthly',
      renewsAt: typeof subscription.renewsAt === 'string' ? subscription.renewsAt : null,
    },
    blocklist: {
      sources: asArray(blocklist.sources),
      lastCheckedAt:
        typeof blocklist.lastCheckedAt === 'string'
          ? blocklist.lastCheckedAt
          : new Date().toISOString(),
      autoUpdate: asBool(blocklist.autoUpdate, true),
      allowed: asArray<string>(blocklist.allowed),
      blocked: asArray<string>(blocklist.blocked),
    } as Blocklist,
    blockedScreen: (isObject(payload.blockedScreen)
      ? payload.blockedScreen
      : {}) as BlockedScreenConfig,
    notifications: (isObject(payload.notifications)
      ? payload.notifications
      : {}) as NotificationSettings,
    weeklyBlocks: asWeek(payload.weeklyBlocks),
    blocksToday: typeof payload.blocksToday === 'number' ? payload.blocksToday : 0,
  };
}

export async function fetchBootstrap(installId: string): Promise<BootstrapState> {
  return parseBootstrap(await api.get<unknown>('/me/bootstrap', { installId }));
}
