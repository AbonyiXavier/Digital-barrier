/**
 * Where the prototype keeps its files, and how it remembers what it changed.
 *
 * Everything lives under ~/.digital-barrier. `barrier on` runs under sudo, so
 * the home directory is resolved from SUDO_USER -- otherwise state would land
 * in /var/root and `barrier status` (run without sudo) would not find it.
 */

import { execFileSync } from "node:child_process";
import { chownSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR_NAME = ".digital-barrier";

export interface SavedState {
  enabled: boolean;
  port: number;
  pid: number;
  /** Network service name -> the DNS servers it had before we touched it. */
  dnsBackup: Record<string, string[]>;
  services?: string[];
  startedAt?: number;
}

/**
 * Whose home directory state belongs in.
 *
 * Under `sudo` this is SUDO_USER. A LaunchDaemon has no SUDO_USER -- it is just
 * root -- so the scheduled job passes BARRIER_USER explicitly; without it, state
 * would land in /var/root where the user's own commands cannot see it.
 */
function sudoUser(): string | undefined {
  for (const key of ["BARRIER_USER", "SUDO_USER"]) {
    const user = process.env[key];
    if (user !== undefined && user !== "") return user;
  }
  return undefined;
}

function userHome(): string {
  const user = sudoUser();
  if (user !== undefined) {
    try {
      const home = execFileSync("/usr/bin/dscl", [".", "-read", `/Users/${user}`,
        "NFSHomeDirectory"], { encoding: "utf8" });
      const match = /NFSHomeDirectory:\s*(.+)/.exec(home);
      if (match?.[1] !== undefined) return match[1].trim();
    } catch {
      // Fall through to the process home below.
    }
  }
  return homedir();
}

/** Hand files back to the real user so non-sudo commands can read them. */
function chownToUser(path: string): void {
  if (process.getuid?.() !== 0) return;
  const user = sudoUser();
  if (user === undefined) return;
  try {
    const uid = Number(execFileSync("/usr/bin/id", ["-u", user], { encoding: "utf8" }));
    const gid = Number(execFileSync("/usr/bin/id", ["-g", user], { encoding: "utf8" }));
    if (Number.isInteger(uid) && Number.isInteger(gid)) chownSync(path, uid, gid);
  } catch {
    // Best effort -- wrong ownership is inconvenient, not fatal.
  }
}

/** The human this state belongs to (not root, when running under sudo). */
export function invokingUser(): string {
  return sudoUser() ?? userInfo().username;
}

export function appDir(): string {
  const path = join(userHome(), APP_DIR_NAME);
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o755 });
    chownToUser(path);
  }
  return path;
}

export const stateFile = (): string => join(appDir(), "state.json");
export const pidFile = (): string => join(appDir(), "resolver.pid");
export const queryLog = (): string => join(appDir(), "queries.log");
export const resolverLog = (): string => join(appDir(), "resolver.log");
export const updatesFile = (): string => join(appDir(), "updates.json");
export const bypassLog = (): string => join(appDir(), "bypass.log");

/** The directory holding the compiled JS (dist/src). */
export function distDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** Project root, located by its rule files rather than a fixed depth. */
export function projectDir(): string {
  let current = distDir();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(current, "blocklist.txt"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) break;
    current = parent;
  }
  return resolve(distDir(), "..", "..");
}

export const blockPath = (): string => join(projectDir(), "blocklist.txt");
export const allowPath = (): string => join(projectDir(), "allowlist.txt");
export const safeSearchPath = (): string => join(projectDir(), "safesearch.txt");

/** Downloaded feeds live here, separate from the hand-written blocklist. */
export function feedsDir(): string {
  const path = join(projectDir(), "feeds");
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o755 });
  return path;
}

/**
 * Every file the resolver draws block rules from: the user's own blocklist
 * first, then each installed feed.
 */
export function blockSources(): string[] {
  const sources = [blockPath()];
  try {
    for (const file of readdirSync(feedsDir()).sort()) {
      if (file.endsWith(".txt")) sources.push(join(feedsDir(), file));
    }
  } catch {
    // No feeds installed.
  }
  return sources;
}

export async function readState(): Promise<SavedState | null> {
  try {
    return JSON.parse(await readFile(stateFile(), "utf8")) as SavedState;
  } catch {
    return null;
  }
}

/** Write atomically: a half-written state file would strand system DNS. */
export async function writeState(state: SavedState): Promise<void> {
  const target = stateFile();
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  chownToUser(target);
}

export async function clearState(): Promise<void> {
  for (const path of [stateFile(), pidFile()]) {
    try {
      await unlink(path);
    } catch {
      // Already gone.
    }
  }
}
