/**
 * Telling the server about the phone the app is running on.
 *
 * Registration used to be an onboarding screen that called nothing: it animated a
 * progress bar and finished with "registered and filtering", while the account it
 * belonged to had no device rows at all. Every count derived from that list —
 * "Devices covered", "Blocked today" — then read zero on a phone that was
 * filtering perfectly well.
 *
 * So registration happens here instead, on launch, for whoever is signed in. It
 * is idempotent on the install id, which means it survives a reinstall, a second
 * account on the same handset, and a user who skipped onboarding.
 */
import * as ExpoDevice from 'expo-device';
import { Platform } from 'react-native';

import type { Device, DevicePlatform } from '@/types';

import { api } from './client';

/**
 * The wire platform, or null where the app has no device story yet.
 *
 * Returning null rather than guessing: a row claiming to be a covered Windows PC
 * because the bundler ran on web would be a lie of exactly the kind this file
 * exists to stop.
 */
function platformWire(): DevicePlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'macos') return 'macos';
  if (Platform.OS === 'windows') return 'windows';
  return null;
}

/**
 * What to call this device in the list.
 *
 * `modelName` is "Redmi Note 9S" on a real handset and null on a simulator, so
 * the fallback stays generic rather than inventing a model. The server only uses
 * this for a first name — a row the user has renamed is never overwritten.
 */
function deviceName(): string {
  const model = ExpoDevice.modelName;
  if (typeof model === 'string' && model.trim() !== '') return model.trim();
  return Platform.OS === 'ios' ? 'This iPhone' : 'This Android phone';
}

/**
 * Registers this installation. Returns null where the platform has no device
 * concept, so the caller can skip without special-casing.
 */
export async function registerThisDevice(installId: string): Promise<Device | null> {
  const platform = platformWire();
  if (platform === null) {
    if (__DEV__) console.log(`[devices] no device concept for platform ${Platform.OS}`);
    return null;
  }

  const name = deviceName();
  if (__DEV__) console.log(`[devices] registering "${name}" (${platform})`);

  try {
    const device = await api.post<Device>('/devices/this', { name, platform }, { installId });
    if (__DEV__) console.log(`[devices] registered as ${device.id}`);
    return device;
  } catch (error) {
    // Logged here as well as surfaced upstream: a registration that quietly fails
    // leaves every device-derived count reading zero, with nothing on screen to
    // say why, which is exactly the failure this module was written to end.
    if (__DEV__) console.log(`[devices] registration failed: ${String(error)}`);
    throw error;
  }
}

/**
 * Reports whether this device is filtering.
 *
 * This is the only thing that can move a row to `protected`. The server cannot
 * observe a handset's tunnel, and a status inferred from "the account is switched
 * on" would put a green tick next to a phone that had never been granted VPN
 * consent.
 */
export async function reportFiltering(
  deviceId: string,
  filtering: boolean,
  installId: string,
): Promise<void> {
  await api.post(`/devices/${deviceId}/heartbeat`, { filtering }, { installId });
}
