/**
 * Keeping the compiled blocklist on disk.
 *
 * The native module takes a path rather than bytes: the artifact is megabytes,
 * and handing it across the JS bridge on every start would be wasteful when the
 * file has to exist anyway for the service to survive a restart.
 *
 * Downloads are conditional. The server hashes the artifact into an ETag, so a
 * device that polls on a metered connection almost always gets a 304 and spends
 * nothing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { API_BASE_URL, getSessionToken } from '@/lib/api/client';

const ETAG_KEY = 'aegis.blocklist.etag';
const FILE_NAME = 'blocklist.aegb';

export interface BlocklistFile {
  /** Filesystem path, with no `file://` scheme — what the native side expects. */
  path: string;
  /** Bytes on disk. */
  size: number;
  /** True when the server answered 304 and the existing file was kept. */
  unchanged: boolean;
}

function target(): File {
  // Cache rather than documents: it is derived data, the server can always
  // re-serve it, and the OS may reclaim it under pressure without harm.
  const directory = new Directory(Paths.cache, 'aegis');
  if (!directory.exists) directory.create({ intermediates: true });
  return new File(directory, FILE_NAME);
}

/** Strips the scheme, because Kotlin's java.io.File wants a plain path. */
const toNativePath = (uri: string): string => uri.replace(/^file:\/\//, '');

/**
 * Makes sure the newest artifact is on disk, and returns where.
 *
 * Throws if there is nothing usable — neither a fresh download nor a cached
 * file. Starting the tunnel with no rules would report protection while blocking
 * nothing, which is the one outcome worth failing loudly for.
 */
export async function ensureBlocklist(): Promise<BlocklistFile> {
  const file = target();
  const knownEtag = await AsyncStorage.getItem(ETAG_KEY).catch(() => null);
  const token = await getSessionToken();

  const headers: Record<string, string> = { accept: 'application/octet-stream' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (knownEtag !== null && file.exists) headers['if-none-match'] = knownEtag;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/blocklist/compiled`, { headers });
  } catch (error) {
    // Offline is survivable if we already have a list; otherwise it is fatal.
    if (file.exists) {
      return { path: toNativePath(file.uri), size: file.size ?? 0, unchanged: true };
    }
    throw new Error(
      `No blocklist on this device and the server is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (response.status === 304 && file.exists) {
    return { path: toNativePath(file.uri), size: file.size ?? 0, unchanged: true };
  }

  if (!response.ok) {
    if (file.exists) {
      return { path: toNativePath(file.uri), size: file.size ?? 0, unchanged: true };
    }
    throw new Error(`The server refused the blocklist (HTTP ${response.status}).`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  // A header-only artifact means zero domains — protection that blocks nothing.
  if (bytes.byteLength <= 12) {
    throw new Error('The server sent an empty blocklist. Check the feeds have been refreshed.');
  }

  file.write(bytes);
  const etag = response.headers.get('etag');
  if (etag !== null) await AsyncStorage.setItem(ETAG_KEY, etag).catch(() => {});

  return { path: toNativePath(file.uri), size: bytes.byteLength, unchanged: false };
}

/** Forgets the cached ETag, so the next call re-downloads. */
export async function invalidateBlocklist(): Promise<void> {
  await AsyncStorage.removeItem(ETAG_KEY).catch(() => {});
}
