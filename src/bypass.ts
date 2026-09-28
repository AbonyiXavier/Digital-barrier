/**
 * Bypass detection.
 *
 * A filter that reports "protected" while a VPN routes around it is worse than
 * no filter, because it manufactures confidence. This module answers one
 * question honestly -- are we actually in the path? -- and records every
 * transition.
 *
 * The split here is deliberate. `sense()` is the only macOS-specific part and
 * will be rewritten per platform (on iOS the Network Extension gets a callback
 * when it is disabled; on Android it is `VpnService.onRevoke()`). Everything
 * below it -- what counts as a bypass, the event model, the log -- is portable
 * and is the part worth getting right now.
 */

import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

import { LOOPBACK, defaultRouteInterface, activeResolver, getDns, isTunnel, networkServices }
  from "./system.js";
import { bypassLog } from "./state.js";

export type Protection = "protected" | "degraded" | "bypassed";

export type Reason =
  | "resolver-outranked"
  | "dns-reconfigured"
  | "resolver-down"
  | "tunnel-active"
  | "none";

/** A point-in-time reading of the machine's network posture. */
export interface Snapshot {
  /** The resolver the OS says it will actually use. */
  primaryResolver: string | null;
  defaultInterface: string | null;
  tunnel: boolean;
  /** Services still configured to point at us. */
  pointedServices: string[];
  /** Services that are not. */
  strayServices: string[];
  resolverAnswering: boolean;
}

export interface Verdict {
  state: Protection;
  reason: Reason;
  detail: string;
}

/** PLATFORM-SPECIFIC. Everything below this line is portable. */
export async function sense(resolverAnswering: boolean): Promise<Snapshot> {
  const [primaryResolver, defaultInterface, services] = await Promise.all([
    activeResolver(),
    defaultRouteInterface(),
    networkServices(),
  ]);
  const pointedServices: string[] = [];
  const strayServices: string[] = [];
  for (const service of services) {
    const servers = await getDns(service);
    if (servers.length === 1 && servers[0] === LOOPBACK) pointedServices.push(service);
    else strayServices.push(service);
  }
  return {
    primaryResolver,
    defaultInterface,
    tunnel: isTunnel(defaultInterface),
    pointedServices,
    strayServices,
    resolverAnswering,
  };
}

/**
 * Turn a snapshot into a verdict.
 *
 * `bypassed` means lookups are not reaching us at all. `degraded` means they
 * still are, but a tunnel holds the default route, so traffic can reach a
 * blocked host by address without ever asking us.
 */
export function classify(snapshot: Snapshot): Verdict {
  if (!snapshot.resolverAnswering) {
    return {
      state: "bypassed",
      reason: "resolver-down",
      detail: "the resolver is not answering",
    };
  }
  if (snapshot.primaryResolver !== null && snapshot.primaryResolver !== LOOPBACK) {
    return {
      state: "bypassed",
      reason: "resolver-outranked",
      detail: `the OS is using ${snapshot.primaryResolver}` +
        (snapshot.tunnel ? ` via ${snapshot.defaultInterface ?? "a tunnel"}` : ""),
    };
  }
  if (snapshot.pointedServices.length === 0) {
    return {
      state: "bypassed",
      reason: "dns-reconfigured",
      detail: "no network service points at the filter any more",
    };
  }
  if (snapshot.tunnel) {
    return {
      state: "degraded",
      reason: "tunnel-active",
      detail: `DNS is still filtered, but ${snapshot.defaultInterface ?? "a tunnel"} ` +
        "holds the default route, so traffic can leave by address",
    };
  }
  if (snapshot.strayServices.length > 0) {
    return {
      state: "degraded",
      reason: "dns-reconfigured",
      detail: `not pointing at the filter: ${snapshot.strayServices.join(", ")}`,
    };
  }
  return { state: "protected", reason: "none", detail: "all lookups pass through the filter" };
}

export type EventType = "STARTED" | "ENDED" | "CHANGED";

export interface BypassEvent {
  at: string;
  type: EventType;
  state: Protection;
  reason: Reason;
  detail: string;
  /** How long the previous state had lasted, for ENDED/CHANGED. */
  durationMs?: number;
  /** Hash of the preceding entry, so deletions and edits are detectable. */
  prev: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

function digest(event: Omit<BypassEvent, "hash">): string {
  const canonical = JSON.stringify([
    event.at, event.type, event.state, event.reason, event.detail,
    event.durationMs ?? null, event.prev,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Append an event, chained to the previous one.
 *
 * The chain is what makes this usable for accountability: a partner can verify
 * that nothing was quietly removed. It does not stop someone with root from
 * deleting the file, but it does stop them editing out a single evening.
 */
export async function appendEvent(
  event: Omit<BypassEvent, "prev" | "hash">,
): Promise<BypassEvent> {
  const existing = await readEvents();
  const prev = existing[existing.length - 1]?.hash ?? GENESIS;
  const unsigned = { ...event, prev };
  const complete: BypassEvent = { ...unsigned, hash: digest(unsigned) };
  await appendFile(bypassLog(), `${JSON.stringify(complete)}\n`, "utf8");
  return complete;
}

export async function readEvents(): Promise<BypassEvent[]> {
  let text: string;
  try {
    text = await readFile(bypassLog(), "utf8");
  } catch {
    return [];
  }
  const events: BypassEvent[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line) as BypassEvent);
    } catch {
      // A malformed line is itself evidence; verifyChain will surface it.
    }
  }
  return events;
}

export interface ChainCheck {
  ok: boolean;
  /** Index of the first entry that does not follow from its predecessor. */
  brokenAt: number | null;
}

export function verifyChain(events: BypassEvent[]): ChainCheck {
  let expectedPrev = GENESIS;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined) return { ok: false, brokenAt: i };
    const { hash, ...rest } = event;
    if (event.prev !== expectedPrev || digest(rest) !== hash) {
      return { ok: false, brokenAt: i };
    }
    expectedPrev = hash;
  }
  return { ok: true, brokenAt: null };
}

/** How many consecutive readings must agree before a change is recorded. */
export const DEFAULT_CONFIRMATIONS = 2;

const sameVerdict = (a: Verdict, b: Verdict): boolean =>
  a.state === b.state && a.reason === b.reason;

/**
 * Watches for transitions and records them. Only changes are written, so a
 * quiet machine produces no entries at all.
 *
 * A change has to hold for `confirmations` consecutive readings before it is
 * recorded. Without that, the seconds between `barrier on` setting DNS and the
 * OS picking it up log as a bypass -- which reads to an accountability partner
 * as "they turned it off at 15:46" when they had just turned it on. A log that
 * cries wolf gets ignored, so brief flaps must not reach it.
 */
export interface MonitorOptions {
  onEvent?: (event: BypassEvent) => void;
  confirmations?: number;
  /** Swappable so tests never touch the real event log. */
  persist?: (event: Omit<BypassEvent, "prev" | "hash">) => Promise<BypassEvent>;
}

export class Monitor {
  private last: Verdict | null = null;
  private since = Date.now();
  private pending: Verdict | null = null;
  private pendingCount = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly onEvent: (event: BypassEvent) => void;
  private readonly confirmations: number;
  private readonly persist: (event: Omit<BypassEvent, "prev" | "hash">) => Promise<BypassEvent>;

  /** `sensor` is the platform seam -- the only part that differs per OS. */
  constructor(
    private readonly sensor: () => Promise<Snapshot>,
    private readonly intervalMs: number,
    options: MonitorOptions = {},
  ) {
    this.onEvent = options.onEvent ?? (() => {});
    this.confirmations = options.confirmations ?? DEFAULT_CONFIRMATIONS;
    this.persist = options.persist ?? appendEvent;
  }

  /** The last confirmed verdict, or null before one has settled. */
  get current(): Verdict | null {
    return this.last;
  }

  async tick(): Promise<Verdict> {
    const verdict = classify(await this.sensor());
    const previous = this.last;

    // Already the committed state: nothing pending, nothing to record.
    if (previous !== null && sameVerdict(previous, verdict)) {
      this.pending = null;
      this.pendingCount = 0;
      return previous;
    }

    if (this.pending !== null && sameVerdict(this.pending, verdict)) {
      this.pendingCount += 1;
    } else {
      this.pending = verdict;
      this.pendingCount = 1;
    }
    if (this.pendingCount < this.confirmations) return previous ?? verdict;

    this.pending = null;
    this.pendingCount = 0;
    const durationMs = previous === null ? undefined : Date.now() - this.since;
    this.last = verdict;
    this.since = Date.now();

    // "Started, and everything is fine" is not worth an entry.
    if (previous === null && verdict.state === "protected") return verdict;

    const type: EventType = verdict.state === "protected"
      ? "ENDED"
      : previous === null || previous.state === "protected" ? "STARTED" : "CHANGED";
    this.onEvent(await this.persist({
      at: new Date().toISOString(), type,
      state: verdict.state, reason: verdict.reason, detail: verdict.detail,
      ...(durationMs !== undefined ? { durationMs } : {}),
    }));
    return verdict;
  }

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
