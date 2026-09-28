/**
 * The HTTP client.
 *
 * One place that knows about the base URL, the session, the error shape and
 * timeouts — so no screen ever calls `fetch` directly and error handling cannot
 * drift between features.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getSessionToken, setSessionToken } from './session';

/** The single error shape the API returns, from its global exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  path?: string;
  timestamp?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = body.statusCode;
    this.code = body.code;
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** True when retrying could plausibly succeed. */
  get isTransient(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/** Network unreachable, DNS failure, timeout — distinct from a server refusal. */
export class NetworkError extends Error {
  constructor(message = 'No connection.') {
    super(message);
    this.name = 'NetworkError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** The Android emulator reaches the host machine through this alias, not localhost. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (typeof fromEnv === 'string' && fromEnv !== '') return fromEnv.replace(/\/+$/, '');

  // Derive from whatever is serving the JS, so a device on the same network finds
  // the API without anyone editing a file. `hostUri` is set in Expo Go;
  // `debuggerHost` and `experienceUrl` cover a development build, where the first
  // is often empty.
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.experienceUrl,
  ];
  let host: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate === '') continue;
    // Values arrive as `host:port`, or sometimes as a full URL.
    const withoutScheme = candidate.replace(/^\w+:\/\//, '');
    const first = withoutScheme.split(/[:/]/)[0];
    if (first !== undefined && first !== '') {
      host = first;
      break;
    }
  }

  // On Android, `localhost` is the device — so a loopback address here means the
  // API is unreachable rather than local. The emulator has a documented alias for
  // the host machine; a physical device has no equivalent and needs
  // EXPO_PUBLIC_API_URL set.
  if (
    Platform.OS === 'android' &&
    (host === undefined || host === 'localhost' || host === '127.0.0.1')
  ) {
    host = ANDROID_EMULATOR_HOST;
  }

  return `http://${host ?? 'localhost'}:3000`;
}

export const API_BASE_URL = resolveBaseUrl();

if (__DEV__) {
  // The single most useful line when a device cannot reach the API.
  console.log(`[api] base url: ${API_BASE_URL}`);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Identifies this installation so the API can compute `isCurrent`. */
  installId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, installId, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  const token = await getSessionToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // React Native has no cookie jar we can rely on, so the session travels as a
  // bearer token; Better Auth accepts either.
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (installId !== undefined) headers['x-install-id'] = installId;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError(
      controller.signal.aborted ? 'The request timed out.' : 'No connection.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text === '' ? null : safeParse(text);

  if (!response.ok) {
    // A dead session must not leave a stale token behind to fail every later call.
    if (response.status === 401) await setSessionToken(null);
    throw new ApiError(
      isErrorBody(payload)
        ? payload
        : {
            statusCode: response.status,
            code: `HTTP_${response.status}`,
            message: typeof payload === 'string' ? payload : response.statusText,
          },
    );
  }
  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).statusCode === 'number' &&
    typeof (value as ApiErrorBody).message === 'string'
  );
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export { getSessionToken, setSessionToken };
