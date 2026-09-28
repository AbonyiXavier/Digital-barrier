/**
 * Maintained blocklist feeds.
 *
 * A hand-written blocklist.txt is a demo. Real coverage means a curated feed of
 * tens of thousands of domains, refreshed regularly. Feeds are installed into
 * their own files so `barrier update` can never clobber the rules the user
 * wrote by hand.
 *
 * Nothing is installed until it passes validation: a feed is about to become
 * this machine's DNS policy, so a truncated download or a mis-categorised list
 * must fail loudly rather than quietly break the internet.
 */

import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseRules } from "./blocklist.js";
import { feedsDir, updatesFile } from "./state.js";

export interface Source {
  url: string;
  description: string;
}

export const SOURCES: Record<string, Source> = {
  "hagezi-nsfw": {
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/nsfw-onlydomains.txt",
    description: "HaGeZi NSFW -- bare domains, refreshed every few hours",
  },
  "hagezi-gambling": {
    url: "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/gambling-onlydomains.txt",
    description: "HaGeZi Gambling -- betting and casino sites",
  },
  "stevenblack-porn": {
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts",
    description: "StevenBlack hosts, porn extension -- hosts format",
  },
  "stevenblack-gambling": {
    url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts",
    description: "StevenBlack hosts, gambling extension -- hosts format",
  },
};

/** Bare domains suit our label-wise matcher: one rule covers every subdomain. */
export const DEFAULT_SOURCE = "hagezi-nsfw";

export interface FeedMeta {
  name: string;
  url: string;
  fetchedAt: string;
  entries: number;
  bytes: number;
  sha256: string;
  /** Entry count of the version this one replaced, for the shrink guard. */
  previousEntries?: number;
}

export interface UpdateAttempt {
  at: string;
  name: string;
  url: string;
  ok: boolean;
  entries?: number;
  error?: string;
  /** True when the feed was byte-identical to what was already installed. */
  unchanged?: boolean;
}

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_BYTES = 64 * 1024 * 1024;
/** Below this, assume a truncated download or an HTML error page. */
const MIN_ENTRIES = 1_000;
/**
 * A feed that suddenly loses a third of its domains is far more likely to be a
 * broken upstream build than a real change. Validation catches a truncated
 * download; this catches a feed that shrank while still looking well-formed.
 */
export const MAX_SHRINK_RATIO = 0.3;
/** How many update attempts to keep in the history. */
const HISTORY_LIMIT = 50;

/**
 * Infrastructure that must never end up sinkholed. If a feed blocks any of
 * these, it is mis-categorised or hostile, and installing it would break the
 * machine in ways that are hard to diagnose from a browser error.
 */
export const SENTINELS = [
  "apple.com", "icloud.com", "mzstatic.com",
  "microsoft.com", "office.com", "live.com",
  "google.com", "gstatic.com", "googleapis.com",
  "cloudflare.com", "amazonaws.com", "akamai.net", "akamaiedge.net",
  "github.com", "mozilla.org", "wikipedia.org",
  "slack.com", "zoom.us", "paypal.com", "stripe.com",
];

export class FeedError extends Error {}

/** Does `rules` block `name` or any parent of it? Mirrors Blocklist matching. */
function blocks(rules: Set<string>, name: string): boolean {
  const labels = name.split(".");
  for (let i = 0; i < labels.length; i += 1) {
    if (rules.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export interface ValidationResult {
  rules: Set<string>;
  blockedSentinels: string[];
}

export function validate(text: string): ValidationResult {
  const rules = parseRules(text);
  if (rules.size < MIN_ENTRIES) {
    throw new FeedError(
      `feed has only ${rules.size} usable domains (expected at least ${MIN_ENTRIES}) -- ` +
      "the download was probably truncated or is not a blocklist",
    );
  }
  return { rules, blockedSentinels: SENTINELS.filter((name) => blocks(rules, name)) };
}

export async function download(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
      headers: { "user-agent": "digital-barrier/0.1 (+prototype)" },
    });
  } catch (error) {
    throw new FeedError(`could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new FeedError(`${url} returned HTTP ${response.status} ${response.statusText}`);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) {
    throw new FeedError(`feed is ${body.byteLength} bytes, over the ${MAX_BYTES} limit`);
  }
  return Buffer.from(body).toString("utf8");
}

export const feedPath = (name: string): string => join(feedsDir(), `${name}.txt`);
export const metaPath = (name: string): string => join(feedsDir(), `${name}.meta.json`);
/** No `.txt` suffix on purpose: the resolver globs `*.txt`, so this stays inert. */
export const backupPath = (name: string): string => join(feedsDir(), `${name}.prev`);

export async function readMeta(name: string): Promise<FeedMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath(name), "utf8")) as FeedMeta;
  } catch {
    return null;
  }
}

export interface InstallResult {
  meta: FeedMeta;
  /** The feed was byte-identical to the installed one; nothing was rewritten. */
  unchanged: boolean;
}

/** Download, validate, then install atomically. */
export async function install(
  name: string,
  url: string,
  options: { force?: boolean } = {},
): Promise<InstallResult> {
  const text = await download(url);
  const { rules, blockedSentinels } = validate(text);

  if (blockedSentinels.length > 0) {
    throw new FeedError(
      `refusing to install: this feed blocks infrastructure domains ` +
      `(${blockedSentinels.join(", ")}). Installing it would break normal browsing.`,
    );
  }

  const sha256 = createHash("sha256").update(text).digest("hex");
  const existing = await readMeta(name);

  if (existing !== null && existing.sha256 === sha256) {
    return { meta: existing, unchanged: true };
  }

  if (existing !== null && options.force !== true) {
    const floor = Math.floor(existing.entries * (1 - MAX_SHRINK_RATIO));
    if (rules.size < floor) {
      const drop = (100 * (1 - rules.size / existing.entries)).toFixed(0);
      throw new FeedError(
        `refusing to install: ${name} shrank ${drop}% ` +
        `(${existing.entries} -> ${rules.size} domains). That usually means a broken ` +
        `upstream build, not a real change. Re-run with --force to accept it.`,
      );
    }
  }

  const meta: FeedMeta = {
    name,
    url,
    fetchedAt: new Date().toISOString(),
    entries: rules.size,
    bytes: Buffer.byteLength(text),
    sha256,
    ...(existing !== null ? { previousEntries: existing.entries } : {}),
  };

  // Write the normalised rules rather than the raw feed: one domain per line,
  // already de-duplicated, so the resolver's load path stays trivial.
  const header =
    `# Installed by 'barrier update' -- do not edit, it will be overwritten.\n` +
    `# Source: ${url}\n# Fetched: ${meta.fetchedAt}\n# Domains: ${meta.entries}\n\n`;
  const body = [...rules].sort().join("\n");

  // Keep the outgoing version so a bad feed can be rolled back.
  try {
    await copyFile(feedPath(name), backupPath(name));
  } catch {
    // Nothing installed yet.
  }

  const temporary = `${feedPath(name)}.tmp`;
  await writeFile(temporary, header + body + "\n", "utf8");
  await rename(temporary, feedPath(name));
  await writeFile(metaPath(name), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  return { meta, unchanged: false };
}

/** Restore the version this feed replaced. */
export async function rollback(name: string): Promise<number> {
  let text: string;
  try {
    text = await readFile(backupPath(name), "utf8");
  } catch {
    throw new FeedError(`no previous version of ${name} to roll back to`);
  }
  const rules = parseRules(text);
  await writeFile(feedPath(name), text, "utf8");
  const existing = await readMeta(name);
  if (existing !== null) {
    await writeFile(metaPath(name), `${JSON.stringify(
      { ...existing, entries: rules.size, fetchedAt: new Date().toISOString(),
        sha256: createHash("sha256").update(text).digest("hex") }, null, 2)}\n`, "utf8");
  }
  await unlink(backupPath(name)).catch(() => {});
  return rules.size;
}

/**
 * Append an update attempt to the history.
 *
 * An unattended updater that fails silently is worse than none, because you go
 * on believing you are protected. Every attempt is recorded so `barrier status`
 * can say when the feed last actually changed and how long it has been failing.
 */
export async function recordAttempt(attempt: UpdateAttempt): Promise<void> {
  const history = await readHistory();
  history.push(attempt);
  try {
    await writeFile(updatesFile(),
      `${JSON.stringify(history.slice(-HISTORY_LIMIT), null, 2)}\n`, "utf8");
  } catch {
    // History is diagnostics, never a reason to fail an update.
  }
}

export async function readHistory(): Promise<UpdateAttempt[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(updatesFile(), "utf8"));
    return Array.isArray(parsed) ? (parsed as UpdateAttempt[]) : [];
  } catch {
    return [];
  }
}

/** How many attempts have failed since the last success. */
export function consecutiveFailures(history: UpdateAttempt[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.ok === true) break;
    count += 1;
  }
  return count;
}

export async function installed(): Promise<FeedMeta[]> {
  let names: string[];
  try {
    names = await readdir(feedsDir());
  } catch {
    return [];
  }
  const metas: FeedMeta[] = [];
  for (const file of names.filter((n) => n.endsWith(".meta.json"))) {
    try {
      metas.push(JSON.parse(await readFile(join(feedsDir(), file), "utf8")) as FeedMeta);
    } catch {
      // A corrupt meta file just means we cannot describe that feed.
    }
  }
  return metas.sort((a, b) => a.name.localeCompare(b.name));
}

export async function remove(name: string): Promise<boolean> {
  let removed = false;
  for (const path of [feedPath(name), metaPath(name)]) {
    try {
      await unlink(path);
      removed = true;
    } catch {
      // Not installed.
    }
  }
  return removed;
}
