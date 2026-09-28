/**
 * Wire shapes for devices.
 *
 * The app's `Device` type spells platforms and statuses in lower case
 * (`'ios'`, `'needs-setup'`); Postgres spells them as enums (`IOS`,
 * `NEEDS_SETUP`). The HTTP client has no mapping layer, so the translation lives
 * here — one table each way, rather than a `.toLowerCase()` sprinkled through
 * controllers that would quietly produce `needs_setup` and break a screen.
 */

import type {
  DevicePlatform,
  DeviceStatus,
  ProtectionCategory,
} from '../../generated/prisma/client';

export type DevicePlatformWire = 'ios' | 'android' | 'macos' | 'windows';
export type DeviceStatusWire = 'protected' | 'paused' | 'offline' | 'needs-setup';
/** The only statuses a client is allowed to ask for. `offline` is derived. */
export type ClientSettableStatusWire = 'protected' | 'paused';
export type ProtectionCategoryWire =
  | 'adult-websites'
  | 'adult-apps'
  | 'adult-search'
  | 'gambling';

export const PLATFORM_WIRE: readonly DevicePlatformWire[] = ['ios', 'android', 'macos', 'windows'];
export const CLIENT_SETTABLE_STATUS_WIRE: readonly ClientSettableStatusWire[] = [
  'protected',
  'paused',
];

const PLATFORM_TO_DB: Record<DevicePlatformWire, DevicePlatform> = {
  ios: 'IOS',
  android: 'ANDROID',
  macos: 'MACOS',
  windows: 'WINDOWS',
};

const PLATFORM_TO_WIRE: Record<DevicePlatform, DevicePlatformWire> = {
  IOS: 'ios',
  ANDROID: 'android',
  MACOS: 'macos',
  WINDOWS: 'windows',
};

const STATUS_TO_WIRE: Record<DeviceStatus, DeviceStatusWire> = {
  PROTECTED: 'protected',
  PAUSED: 'paused',
  OFFLINE: 'offline',
  NEEDS_SETUP: 'needs-setup',
};

const STATUS_TO_DB: Record<ClientSettableStatusWire, DeviceStatus> = {
  protected: 'PROTECTED',
  paused: 'PAUSED',
};

const CATEGORY_TO_WIRE: Record<ProtectionCategory, ProtectionCategoryWire> = {
  ADULT_WEBSITES: 'adult-websites',
  ADULT_APPS: 'adult-apps',
  ADULT_SEARCH: 'adult-search',
  GAMBLING: 'gambling',
};

export const toDbPlatform = (wire: DevicePlatformWire): DevicePlatform =>
  PLATFORM_TO_DB[wire];
export const toWirePlatform = (db: DevicePlatform): DevicePlatformWire =>
  PLATFORM_TO_WIRE[db];
export const toWireStatus = (db: DeviceStatus): DeviceStatusWire => STATUS_TO_WIRE[db];
export const toDbStatus = (wire: ClientSettableStatusWire): DeviceStatus =>
  STATUS_TO_DB[wire];
export const toWireCategory = (db: ProtectionCategory): ProtectionCategoryWire =>
  CATEGORY_TO_WIRE[db];

/** The device shape the app consumes. `isCurrent` is computed per request. */
export interface DeviceView {
  id: string;
  name: string;
  platform: DevicePlatformWire;
  status: DeviceStatusWire;
  /** ISO timestamp. */
  lastSeen: string;
  isCurrent: boolean;
  /** Seven days, oldest first; index 6 is today. */
  weeklyBlocks: number[];
  /** Echoed so an optimistic client can reconcile its temporary id. */
  clientRef: string | null;
}
