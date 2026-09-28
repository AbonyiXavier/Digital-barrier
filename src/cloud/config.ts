/**
 * Where this device's link to the backend is kept.
 *
 * Separate from `state.json`, which is about the local resolver and system DNS.
 * This file is about identity: who we are signed in as and which device row we
 * are. Losing it means re-pairing, not losing protection.
 */

import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { appDir } from "../state.js";

export const DEFAULT_API_URL = "http://localhost:3000";

export interface CloudConfig {
  apiUrl: string;
  /** Better Auth session token. Sent as a bearer, as the mobile client does. */
  sessionToken?: string;
  /** Email, kept only so `status` can say who this device is signed in as. */
  email?: string;
  /** The server's id for this device, from pairing. */
  deviceId?: string;
  /** Stable per-installation id, so the server can tell devices apart. */
  installId?: string;
  /** ISO timestamp of the last successful sync. */
  lastSyncAt?: string;
  /** The last day whose block count we pushed, so a resync is not a double count. */
  lastReportedDay?: string;
}

const file = (): string => join(appDir(), "cloud.json");

export async function readCloud(): Promise<CloudConfig> {
  try {
    const parsed = JSON.parse(await readFile(file(), "utf8")) as CloudConfig;
    return { ...parsed, apiUrl: parsed.apiUrl ?? DEFAULT_API_URL };
  } catch {
    return { apiUrl: process.env["AEGIS_API_URL"] ?? DEFAULT_API_URL };
  }
}

/** Atomic, so an interrupted write cannot leave a half-parsed session behind. */
export async function writeCloud(config: CloudConfig): Promise<void> {
  const target = file();
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export async function patchCloud(patch: Partial<CloudConfig>): Promise<CloudConfig> {
  const next = { ...(await readCloud()), ...patch };
  await writeCloud(next);
  return next;
}

export async function clearCloud(): Promise<void> {
  try {
    await unlink(file());
  } catch {
    // Already gone.
  }
}

export const isLinked = (config: CloudConfig): boolean =>
  typeof config.sessionToken === "string" && config.sessionToken !== "";

export const isPaired = (config: CloudConfig): boolean =>
  isLinked(config) && typeof config.deviceId === "string" && config.deviceId !== "";
