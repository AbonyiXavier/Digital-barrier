/**
 * Where the session token lives.
 *
 * SecureStore, not AsyncStorage: the store's whole persisted blob is readable by
 * anything with filesystem access on a jailbroken or rooted device, and a session
 * token is exactly the thing that must not be. (The prototype also kept the PIN
 * in that blob in cleartext; the PIN now lives server-side as a hash.)
 *
 * SecureStore is unavailable on web, so it falls back to memory there — a web
 * session simply does not survive a reload, which is the safe direction to fail.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'aegis.session';

let memory: string | null = null;

const available = Platform.OS !== 'web';

export async function getSessionToken(): Promise<string | null> {
  if (!available) return memory;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return memory;
  }
}

export async function setSessionToken(token: string | null): Promise<void> {
  memory = token;
  if (!available) return;
  try {
    if (token === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, token);
  } catch {
    // Keychain refusal is not fatal: the in-memory copy keeps this session going.
  }
}
