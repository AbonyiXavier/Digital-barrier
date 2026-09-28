/**
 * The API client for this device.
 *
 * Deliberately thin and dependency-free: `fetch` is built in, and one place that
 * knows about the base URL, the bearer token and the server's error shape keeps
 * every command from re-inventing them.
 */

import { randomUUID } from "node:crypto";

import { patchCloud, readCloud, type CloudConfig } from "./config.js";

const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class OfflineError extends Error {
  constructor(message = "Could not reach the server.") {
    super(message);
    this.name = "OfflineError";
  }
}

interface ErrorBody {
  statusCode?: number;
  code?: string;
  message?: string;
}

/** A stable id for this installation, minted once and kept. */
export async function installId(): Promise<string> {
  const config = await readCloud();
  if (typeof config.installId === "string" && config.installId !== "") return config.installId;
  const fresh = randomUUID();
  await patchCloud({ installId: fresh });
  return fresh;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Send the stored session. Off for sign-in itself. */
  authenticated?: boolean;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; headers: Headers }> {
  const { method = "GET", body, authenticated = true } = options;
  const config = await readCloud();

  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (authenticated && config.sessionToken !== undefined) {
    headers.authorization = `Bearer ${config.sessionToken}`;
  }
  headers["x-install-id"] = await installId();
  // Node's fetch sends `Origin: null`, which Better Auth rejects as a CSRF risk
  // (an absent header is fine; a null one is not). A CLI has no browser origin,
  // so it declares the API's own — always in the server's trusted list, and
  // same-origin requests are exactly what CSRF protection is meant to allow.
  headers.origin = config.apiUrl;

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new OfflineError(
      error instanceof Error && error.name === "TimeoutError"
        ? "The server did not answer in time."
        : `Could not reach ${config.apiUrl}.`,
    );
  }

  const text = await response.text();
  const payload: unknown = text === "" ? null : safeParse(text);

  if (!response.ok) {
    const record = (payload ?? {}) as ErrorBody;
    throw new ApiError(
      response.status,
      record.code ?? `HTTP_${response.status}`,
      record.message ?? response.statusText,
    );
  }
  return { data: payload as T, headers: response.headers };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// --- auth -------------------------------------------------------------------

export interface SignedInUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Signs in and stores the session.
 *
 * The token comes from the `set-auth-token` response header, which the server's
 * bearer plugin sets — the same path the mobile client uses, so there is one way
 * a session is obtained rather than two.
 */
export async function signIn(email: string, password: string): Promise<SignedInUser> {
  const { data, headers } = await request<{ user?: SignedInUser; token?: string }>(
    "/api/auth/sign-in/email",
    { method: "POST", body: { email, password }, authenticated: false },
  );
  const token = headers.get("set-auth-token") ?? data.token;
  if (typeof token !== "string" || token === "") {
    throw new ApiError(500, "NO_SESSION", "The server did not return a session.");
  }
  if (!data.user) {
    throw new ApiError(500, "NO_USER", "The server did not return an account.");
  }
  await patchCloud({ sessionToken: token, email: data.user.email });
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await request("/api/auth/sign-out", { method: "POST", body: {} });
  } catch {
    // Clearing locally is what actually unlinks this device.
  }
}

// --- devices ----------------------------------------------------------------

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  status: string;
}

export async function claimPairingCode(
  code: string,
  name: string,
): Promise<DeviceRow> {
  const { data } = await request<DeviceRow>("/devices", {
    method: "POST",
    body: {
      code,
      name,
      platform: "macos",
      installId: await installId(),
      clientRef: `cli-${await installId()}`,
    },
  });
  return data;
}

export interface ExpectedConfig {
  deviceId: string;
  status: string;
  protectionOn: boolean;
  enabledCategories: string[];
  serverTime: string;
}

export async function heartbeat(deviceId: string): Promise<ExpectedConfig> {
  const { data } = await request<ExpectedConfig>(`/devices/${deviceId}/heartbeat`, {
    method: "POST",
    body: {},
  });
  return data;
}

/**
 * Reports one day's block count.
 *
 * A count and a date, and nothing else — the server rejects any other field, and
 * the local query log's hostnames never leave this machine.
 */
export async function reportBlocks(
  deviceId: string,
  day: string,
  count: number,
): Promise<void> {
  await request(`/devices/${deviceId}/blocks`, {
    method: "POST",
    body: { day, count },
  });
}

// --- blocklist --------------------------------------------------------------

export interface BlocklistPayload {
  sources: { id: string; name: string; domains: number; updatedAt: string }[];
  lastCheckedAt: string;
  autoUpdate: boolean;
  allowed: string[];
  blocked: string[];
}

export async function fetchBlocklist(): Promise<BlocklistPayload> {
  const { data } = await request<BlocklistPayload>("/blocklist");
  return data;
}

export type { CloudConfig };
