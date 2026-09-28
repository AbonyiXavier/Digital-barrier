/**
 * One sync pass: check in, take the server's word on policy, push counts.
 *
 * The direction of authority matters. The server decides whether protection
 * should be on and which categories are enabled, because the whole product rests
 * on a user not being able to talk their own device out of it. This machine
 * reports two things upward — that it is alive, and how many requests it blocked
 * — and nothing else.
 */

import { readFile, writeFile } from "node:fs/promises";

import {
  fetchBlocklist,
  heartbeat,
  reportBlocks,
  type ExpectedConfig,
} from "./client.js";
import { isPaired, patchCloud, readCloud } from "./config.js";
import { allowPath, queryLog } from "../state.js";

export interface SyncOutcome {
  config: ExpectedConfig;
  /** Days whose counts were accepted, oldest first. */
  reported: { day: string; count: number }[];
  /** Allowlist entries written from the server's copy. */
  allowed: number;
  /** Set when the server's policy disagrees with what is running here. */
  drift: string | null;
}

export class NotPairedError extends Error {
  constructor() {
    super("This device is not paired. Run: barrier login, then barrier pair <code>");
    this.name = "NotPairedError";
  }
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Counts BLOCKED lines per day from the local query log.
 *
 * The log holds hostnames, because locally that is the point — `barrier log` is
 * how a person sees what was blocked. Only the count crosses the boundary: the
 * server has no column for a domain and rejects any body field beyond a date and
 * a number, so this function's contract is to return integers.
 */
export async function countBlocksByDay(logPath = queryLog()): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let text: string;
  try {
    text = await readFile(logPath, "utf8");
  } catch {
    return counts;
  }
  for (const line of text.split("\n")) {
    if (!line.includes(" BLOCKED ")) continue;
    // Lines start with a local-time stamp: 2026-09-26T18:41:57
    const date = line.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

/** Writes the server's allowlist over the local one. */
async function applyAllowlist(allowed: readonly string[]): Promise<number> {
  const header =
    "# Managed by 'barrier sync' -- edited here, this file is overwritten.\n" +
    "# Add exceptions in the app; they arrive on the next sync.\n\n";
  await writeFile(allowPath(), header + [...allowed].sort().join("\n") + "\n", "utf8");
  return allowed.length;
}

export async function sync(options: { reportBlocks?: boolean } = {}): Promise<SyncOutcome> {
  const config = await readCloud();
  if (!isPaired(config) || config.deviceId === undefined) throw new NotPairedError();

  // Check in first: it is the cheapest call and it is what tells us the policy.
  const expected = await heartbeat(config.deviceId);

  const blocklist = await fetchBlocklist();
  const allowed = await applyAllowlist(blocklist.allowed);

  const reported: { day: string; count: number }[] = [];
  if (options.reportBlocks !== false) {
    const counts = await countBlocksByDay();
    const today = day(new Date());
    // Today is always resent because it is still accumulating; earlier days are
    // sent once, so a resync cannot double-count a finished day.
    const since = config.lastReportedDay;
    const days = [...counts.keys()]
      .filter((d) => d === today || since === undefined || d > since)
      .sort();

    for (const d of days) {
      const count = counts.get(d) ?? 0;
      await reportBlocks(config.deviceId, d, count);
      reported.push({ day: d, count });
    }
    // Only finished days advance the marker.
    const finished = days.filter((d) => d < today);
    if (finished.length > 0) {
      await patchCloud({ lastReportedDay: finished[finished.length - 1] });
    }
  }

  await patchCloud({ lastSyncAt: new Date().toISOString() });

  return {
    config: expected,
    reported,
    allowed,
    drift: await describeDrift(expected),
  };
}

/**
 * Compares the server's policy with what is actually running here.
 *
 * Reported rather than silently corrected: `barrier on`/`off` change system DNS
 * and need root, so a sync running unprivileged cannot fix this — and quietly
 * failing to would be the "status says protected when it is not" problem again.
 */
async function describeDrift(expected: ExpectedConfig): Promise<string | null> {
  const { readState } = await import("../state.js");
  const local = await readState();
  const runningHere = local?.enabled === true;

  if (expected.protectionOn && !runningHere) {
    return "the server expects protection ON, but it is off on this device — run: sudo ./barrier on";
  }
  if (!expected.protectionOn && runningHere) {
    return "the server expects protection OFF, but it is on here — run: sudo ./barrier off";
  }
  return null;
}
