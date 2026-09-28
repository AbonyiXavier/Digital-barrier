/**
 * A stable id for this installation.
 *
 * The API uses it to decide which device row is "the one you are holding", which
 * is a property of the request rather than of the device — so it is computed per
 * call and never stored server-side as a flag.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const KEY = 'aegis.installId';

let cached: string | null = null;

export async function getInstallId(): Promise<string> {
  if (cached !== null) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored !== null && stored !== '') {
      cached = stored;
      return stored;
    }
  } catch {
    // Fall through and mint a fresh one.
  }
  const fresh = Crypto.randomUUID();
  cached = fresh;
  try {
    await AsyncStorage.setItem(KEY, fresh);
  } catch {
    // A per-session id is a survivable degradation.
  }
  return fresh;
}
