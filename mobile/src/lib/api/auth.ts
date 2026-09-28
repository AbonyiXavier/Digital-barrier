/**
 * Sign up, sign in, sign out.
 *
 * Better Auth is cookie-first, which React Native has no dependable jar for, so
 * the server runs its bearer plugin: it hands the session back in a
 * `set-auth-token` response header and accepts it as `Authorization: Bearer` on
 * the way in. That token goes to the keychain, never to AsyncStorage.
 */
import { API_BASE_URL, ApiError, NetworkError, setSessionToken } from './client';

export interface AuthedUser {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  user?: { id?: string; name?: string; email?: string };
  token?: string;
}

async function post(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Could not reach the server.');
  }
}

async function complete(response: Response): Promise<AuthedUser> {
  const text = await response.text();
  const payload: unknown = text === '' ? null : safeParse(text);

  if (!response.ok) {
    const record = (payload ?? {}) as { message?: string; code?: string };
    throw new ApiError({
      statusCode: response.status,
      code: record.code ?? `HTTP_${response.status}`,
      message: record.message ?? 'That did not work. Check your details and try again.',
    });
  }

  // The header is the token's home. The body echoes it too, but the header is
  // what the bearer plugin guarantees and what refreshes as the session rolls.
  const token = response.headers.get('set-auth-token') ?? (payload as AuthResponse)?.token;
  if (typeof token === 'string' && token !== '') await setSessionToken(token);

  const user = (payload as AuthResponse)?.user;
  if (!user?.id || !user.email) {
    throw new ApiError({
      statusCode: 500,
      code: 'BAD_AUTH_RESPONSE',
      message: 'The server did not return an account.',
    });
  }
  return { id: user.id, name: user.name ?? '', email: user.email };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthedUser> {
  return complete(await post('/sign-up/email', input));
}

export async function signIn(input: { email: string; password: string }): Promise<AuthedUser> {
  return complete(await post('/sign-in/email', input));
}

export async function signOut(): Promise<void> {
  try {
    await post('/sign-out', {});
  } catch {
    // A failed round trip must not strand the session on the device; clearing
    // locally is what actually signs the person out here.
  }
  await setSessionToken(null);
}

/** Minimum the API enforces, stated here so the form can say so before submitting. */
export const MIN_PASSWORD_LENGTH = 8;
