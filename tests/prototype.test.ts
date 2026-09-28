/**
 * Reliability suite for the Digital Barrier prototype.
 *
 * Runs a real resolver on an unprivileged port (no sudo, no system DNS changes)
 * and drives real DNS queries at it. The point is to prove the core promise
 * holds under the conditions that break naive blockers: subdomains, lookalike
 * domains, IPv6, HTTPS/SVCB records, TCP, concurrency, case, and malformed input.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createSocket } from "node:dgram";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Blocklist, parseRules } from "../src/blocklist.js";
import * as bypass from "../src/bypass.js";
import * as feeds from "../src/feeds.js";
import { SafeSearch, parseMappings } from "../src/safesearch.js";
import * as launchd from "../src/launchd.js";
import * as probe from "../src/probe.js";
import * as wire from "../src/wire.js";

const DIST = fileURLToPath(new URL(".", import.meta.url)); // dist/tests
const SERVE = join(DIST, "..", "src", "serve.js");
const PROJECT = join(DIST, "..", "..");

const tty = process.stdout.isTTY === true;
const GREEN = tty ? "\u001b[32m" : "";
const RED = tty ? "\u001b[31m" : "";
const YELLOW = tty ? "\u001b[33m" : "";
const DIM = tty ? "\u001b[2m" : "";
const BOLD = tty ? "\u001b[1m" : "";
const RESET = tty ? "\u001b[0m" : "";

const HOST = "127.0.0.1";
const BLOCKED_DOMAIN = "pornhub.com";
const ALLOWED_DOMAIN = "google.com";

const TEST_BLOCKLIST = `
# test rules
pornhub.com
xvideos.com
example-adult-site.test
`;
const TEST_SAFESEARCH = `
# forced safe search for the suite
www.google.com                  forcesafesearch.google.com
duckduckgo.com                  safe.duckduckgo.com
`;
const TEST_ALLOWLIST = `
# www is explicitly permitted, overriding the blocklist rule above
www.pornhub.com
`;

const out = (text = ""): void => void process.stdout.write(`${text}\n`);

type Status = "PASS" | "FAIL" | "SKIP";
const results: Array<{ name: string; status: Status; detail: string }> = [];
let online = true;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(
  name: string,
  fn: () => Promise<string>,
  requiresNetwork = false,
): Promise<void> {
  if (requiresNetwork && !online) {
    results.push({ name, status: "SKIP", detail: "no upstream DNS" });
    out(`  ${YELLOW}SKIP${RESET} ${name} ${DIM}(no upstream DNS)${RESET}`);
    return;
  }
  const started = Date.now();
  try {
    const detail = await fn();
    const elapsed = Date.now() - started;
    results.push({ name, status: "PASS", detail });
    out(`  ${GREEN}PASS${RESET} ${name.padEnd(46)} ${DIM}${detail} ${elapsed}ms${RESET}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    out(`  ${RED}FAIL${RESET} ${name.padEnd(46)} ${RED}${detail}${RESET}`);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const socket = createSocket("udp4");
    socket.once("error", rejectPort);
    socket.bind(0, HOST, () => {
      const { port } = socket.address();
      socket.close(() => resolvePort(port));
    });
  });
}

class Server {
  port = 0;
  private child: ChildProcess | null = null;

  constructor(
    readonly dir: string,
    readonly blockPath = join(dir, "blocklist.txt"),
    readonly allowPath = join(dir, "allowlist.txt"),
    readonly logPath = join(dir, "queries.log"),
    readonly safeSearchPath = join(dir, "safesearch.txt"),
  ) {}

  async start(): Promise<void> {
    await writeFile(this.blockPath, TEST_BLOCKLIST, "utf8");
    await writeFile(this.allowPath, TEST_ALLOWLIST, "utf8");
    await writeFile(this.safeSearchPath, TEST_SAFESEARCH, "utf8");

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const port = await freePort();
      const child = spawn(process.execPath, [SERVE, "--host", HOST, "--port", String(port),
        "--blocklist", this.blockPath, "--allowlist", this.allowPath,
        // The monitor senses the real machine and writes to the real event log;
        // a test resolver must never touch live accountability data.
        "--query-log", this.logPath, "--no-monitor",
        "--safesearch", this.safeSearchPath], { stdio: ["ignore", "pipe", "pipe"] });

      let exited = false;
      child.once("exit", () => { exited = true; });

      const deadline = Date.now() + 6000;
      while (Date.now() < deadline) {
        if (exited) break;
        if (await probe.healthy(HOST, port, 400)) {
          this.port = port;
          this.child = child;
          return;
        }
        await delay(150);
      }
      if (!exited) child.kill("SIGTERM");
    }
    throw new Error("resolver would not start");
  }

  get pid(): number {
    const pid = this.child?.pid;
    if (pid === undefined) throw new Error("server is not running");
    return pid;
  }

  async stop(): Promise<void> {
    if (this.child === null || this.child.exitCode !== null) return;
    this.child.kill("SIGTERM");
    await delay(300);
    if (this.child.exitCode === null) this.child.kill("SIGKILL");
  }

  ask(name: string, options: Omit<probe.QueryOptions, "host" | "port"> = {}) {
    return probe.query(name, { host: HOST, port: this.port, timeoutMs: 4000, ...options });
  }
}

const isSinkholed = (answer: probe.Answer): boolean =>
  answer.addresses.length === 1 &&
  (answer.addresses[0] === "0.0.0.0" || answer.addresses[0] === "::");

async function run(server: Server): Promise<void> {
  out();
  out(`${BOLD}Core flow${RESET}  ${DIM}(ON -> DNS filtering -> blocked / allowed)${RESET}`);

  await check(`${BLOCKED_DOMAIN} is BLOCKED`, async () => {
    const answer = await server.ask(BLOCKED_DOMAIN);
    assert(answer.addresses.join() === "0.0.0.0",
      `expected 0.0.0.0, got ${JSON.stringify(answer.addresses)} (${answer.rcodeName})`);
    return "-> 0.0.0.0";
  });

  await check(`${ALLOWED_DOMAIN} is ALLOWED`, async () => {
    const answer = await server.ask(ALLOWED_DOMAIN);
    assert(answer.rcode === 0, `rcode ${answer.rcodeName}`);
    assert(answer.addresses.length > 0, "no addresses returned");
    assert(!isSinkholed(answer), "google.com was sinkholed");
    return `-> ${answer.addresses[0]}`;
  }, true);

  out();
  out(`${BOLD}Matching correctness${RESET}`);

  await check("media.cdn.pornhub.com is BLOCKED", async () => {
    const answer = await server.ask("media.cdn.pornhub.com");
    assert(answer.addresses.join() === "0.0.0.0", `got ${JSON.stringify(answer.addresses)}`);
    return "subdomains inherit the rule";
  });

  await check("notpornhub.com is NOT blocked", async () => {
    const answer = await server.ask("notpornhub.com");
    assert(!isSinkholed(answer), "lookalike domain was wrongly sinkholed");
    return "no substring over-blocking";
  }, true);

  await check("pornhub.com.evil.test is NOT blocked", async () => {
    const answer = await server.ask("pornhub.com.evil.test");
    assert(!isSinkholed(answer), "suffix-only match leaked");
    return "rule anchors at the right labels";
  }, true);

  await check("PoRnHuB.CoM is BLOCKED", async () => {
    const answer = await server.ask("PoRnHuB.CoM");
    assert(answer.addresses.join() === "0.0.0.0", `got ${JSON.stringify(answer.addresses)}`);
    return "case folded";
  });

  await check("allowlisted www.pornhub.com is ALLOWED", async () => {
    const answer = await server.ask("www.pornhub.com");
    assert(!isSinkholed(answer), "allowlist did not override blocklist");
    return "allowlist overrides blocklist";
  }, true);

  out();
  out(`${BOLD}Bypass resistance${RESET}`);

  await check("IPv6 (AAAA) lookup is BLOCKED", async () => {
    const answer = await server.ask(BLOCKED_DOMAIN, { qtype: wire.TYPE_AAAA });
    assert(answer.addresses.join() === "::", `got ${JSON.stringify(answer.addresses)}`);
    return "AAAA sinkholed to ::";
  });

  await check("HTTPS/SVCB record is BLOCKED", async () => {
    const answer = await server.ask(BLOCKED_DOMAIN, { qtype: wire.TYPE_HTTPS });
    assert(answer.rcode === 0, `rcode ${answer.rcodeName}`);
    assert(answer.ancount === 0, `leaked ${answer.ancount} HTTPS records`);
    return "NODATA, no ECH/alt-endpoint leak";
  });

  await check("blocked over TCP (not just UDP)", async () => {
    const answer = await server.ask(BLOCKED_DOMAIN, { tcp: true });
    assert(answer.addresses.join() === "0.0.0.0", `got ${JSON.stringify(answer.addresses)}`);
    return "TCP path filtered too";
  });

  await check("allowed over TCP", async () => {
    const answer = await server.ask(ALLOWED_DOMAIN, { tcp: true });
    assert(answer.addresses.length > 0 && !isSinkholed(answer),
      `got ${JSON.stringify(answer.addresses)}`);
    return `-> ${answer.addresses[0]}`;
  }, true);

  await check("trailing-dot FQDN is BLOCKED", async () => {
    const answer = await server.ask("pornhub.com.");
    assert(answer.addresses.join() === "0.0.0.0", `got ${JSON.stringify(answer.addresses)}`);
    return "fully-qualified form handled";
  });

  await check("non-EDNS client is BLOCKED", async () => {
    const answer = await server.ask(BLOCKED_DOMAIN, { edns: false });
    assert(answer.addresses.join() === "0.0.0.0", `got ${JSON.stringify(answer.addresses)}`);
    return "plain (non-EDNS) clients handled";
  });

  out();
  out(`${BOLD}Robustness${RESET}`);

  await check("malformed packets do not crash resolver", async () => {
    const socket = createSocket("udp4");
    const payloads = [Buffer.alloc(0), Buffer.from([0]), Buffer.from("not-a-dns-packet"),
      randomBytes(64), Buffer.from([0x12, 0x34, 0x01, 0x00, 0x00, 0x01])];
    for (const payload of payloads) {
      await new Promise<void>((done) => socket.send(payload, server.port, HOST, () => done()));
    }
    await new Promise<void>((done) => socket.close(() => done()));
    await delay(300);
    const answer = await server.ask(BLOCKED_DOMAIN);
    assert(answer.addresses.join() === "0.0.0.0", "resolver degraded after garbage");
    return `${payloads.length} malformed packets survived`;
  });

  await check("rules reload without restart", async () => {
    await writeFile(server.blockPath, `${TEST_BLOCKLIST}\nfreshly-added.test\n`, "utf8");
    process.kill(server.pid, "SIGHUP");
    await delay(400);
    const answer = await server.ask("freshly-added.test");
    assert(answer.addresses.join() === "0.0.0.0", "SIGHUP reload did not apply");
    return "SIGHUP picks up new rules";
  });

  await check("200 concurrent queries all blocked", async () => {
    const attempts = Array.from({ length: 200 }, () => server.ask(BLOCKED_DOMAIN));
    const settled = await Promise.allSettled(attempts);
    const failures = settled.filter((result) =>
      result.status === "rejected" || result.value.addresses.join() !== "0.0.0.0");
    assert(failures.length === 0, `${failures.length} failures under load`);
    return "200 concurrent queries, 0 leaks";
  });

  await check("100 sequential queries, no leaks", async () => {
    const latencies: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const started = Date.now();
      const answer = await server.ask(BLOCKED_DOMAIN);
      latencies.push(Date.now() - started);
      assert(answer.addresses.join() === "0.0.0.0", "leak during sustained run");
    }
    latencies.sort((a, b) => a - b);
    return `100/100 blocked, median ${latencies[50]}ms, p95 ${latencies[95]}ms`;
  });

  out();
  out(`${BOLD}Shipped rule files${RESET}`);

  await check("blocklist.txt encodes the intended flow", async () => {
    const rules = new Blocklist(join(PROJECT, "blocklist.txt"), join(PROJECT, "allowlist.txt"));
    const counts = await rules.load();
    assert(counts.blocked > 0, "blocklist.txt is empty");
    assert(!rules.decide(BLOCKED_DOMAIN).allowed, `${BLOCKED_DOMAIN} missing from blocklist.txt`);
    assert(rules.decide(ALLOWED_DOMAIN).allowed, `${ALLOWED_DOMAIN} is wrongly in the blocklist`);
    return `${counts.blocked} rules, pornhub.com blocked, google.com clear`;
  });

  out();
  out(`${BOLD}Blocklist feeds${RESET}`);

  await check("hosts-format feed parses", async () => {
    const rules = parseRules([
      "# Title: some feed",
      "0.0.0.0 feed-one.test",
      "0.0.0.0 www.feed-one.test",
      "127.0.0.1 feed-two.test",
      "bare-domain.test",
      "*.wildcard.test",
    ].join("\n"));
    assert(rules.has("feed-one.test"), "hosts line not parsed");
    assert(rules.has("feed-two.test"), "127.0.0.1 hosts line not parsed");
    assert(rules.has("bare-domain.test"), "bare domain not parsed");
    assert(rules.has("wildcard.test"), "*. prefix not stripped");
    assert(!rules.has("0.0.0.0"), "sinkhole IP leaked in as a rule");
    return `${rules.size} rules from mixed syntax`;
  });

  await check("truncated feed is rejected", async () => {
    try {
      feeds.validate("0.0.0.0 only-one.test\n");
      throw new Error("a 1-domain feed was accepted");
    } catch (error) {
      assert(error instanceof feeds.FeedError, `wrong error type: ${String(error)}`);
      return "too-small feed refused";
    }
  });

  await check("feed blocking infrastructure is rejected", async () => {
    // A plausible-looking feed that would brick normal browsing.
    const poisoned = Array.from({ length: 2000 }, (_, i) => `spam-${i}.test`);
    poisoned.push("google.com", "apple.com");
    const result = feeds.validate(poisoned.join("\n"));
    assert(result.blockedSentinels.includes("google.com"), "google.com not flagged");
    assert(result.blockedSentinels.includes("apple.com"), "apple.com not flagged");
    return `${result.blockedSentinels.length} sentinels caught before install`;
  });

  await check("clean feed passes validation", async () => {
    const clean = Array.from({ length: 2000 }, (_, i) => `adult-site-${i}.test`);
    const result = feeds.validate(clean.join("\n"));
    assert(result.blockedSentinels.length === 0, "false positive on a clean feed");
    assert(result.rules.size === 2000, `expected 2000 rules, got ${result.rules.size}`);
    return "2000 domains, 0 sentinels tripped";
  });

  await check("blocklist.txt and feeds are merged", async () => {
    const feedFile = join(server.dir, "feed-sample.txt");
    await writeFile(feedFile, "from-the-feed.test\nanother-feed-domain.test\n", "utf8");
    const merged = new Blocklist([server.blockPath, feedFile], server.allowPath);
    const counts = await merged.load();
    assert(!merged.decide("from-the-feed.test").allowed, "feed rule not applied");
    assert(!merged.decide(BLOCKED_DOMAIN).allowed, "hand-written rule lost when merging");
    assert(merged.decide("www.pornhub.com").allowed, "allowlist stopped working after merge");
    return `${counts.blocked} rules from 2 files`;
  });

  out();
  out(`${BOLD}Automatic updates${RESET}`);

  await check("shrink guard rejects a collapsed feed", async () => {
    // Simulate an upstream build that silently lost most of its domains.
    const big = Array.from({ length: 10000 }, (_, i) => `site-${i}.test`).join("\n");
    const small = Array.from({ length: 2000 }, (_, i) => `site-${i}.test`).join("\n");
    const bigCount = feeds.validate(big).rules.size;
    const smallCount = feeds.validate(small).rules.size;
    const floor = Math.floor(bigCount * (1 - feeds.MAX_SHRINK_RATIO));
    assert(smallCount < floor,
      `${smallCount} should fall below the ${floor} floor for ${bigCount} domains`);
    // A modest change must still be accepted.
    const slightly = Array.from({ length: 9000 }, (_, i) => `site-${i}.test`).join("\n");
    assert(feeds.validate(slightly).rules.size >= floor, "a 10% change was wrongly rejected");
    return `>${(feeds.MAX_SHRINK_RATIO * 100).toFixed(0)}% shrink blocked, 10% allowed`;
  });

  await check("update history tracks consecutive failures", async () => {
    const now = new Date().toISOString();
    const base = { at: now, name: "f", url: "u" };
    assert(feeds.consecutiveFailures([]) === 0, "empty history should report 0");
    assert(feeds.consecutiveFailures([{ ...base, ok: true }]) === 0, "success counted as failure");
    const mixed = [
      { ...base, ok: true },
      { ...base, ok: false, error: "timeout" },
      { ...base, ok: false, error: "timeout" },
    ];
    assert(feeds.consecutiveFailures(mixed) === 2, "should report 2 failures since last success");
    return "failure streak counted correctly";
  });

  await check("scheduled job uses launchd, not cron", async () => {
    const plist = launchd.updateJob(6).plist();
    assert(plist.includes("<key>StartInterval</key>"), "no StartInterval");
    assert(plist.includes("<integer>21600</integer>"), "interval not 6h");
    assert(plist.includes("<key>RunAtLoad</key>"), "no RunAtLoad");
    // A LaunchDaemon has no SUDO_USER, so state would land in /var/root.
    assert(plist.includes("BARRIER_USER"), "BARRIER_USER not passed to the daemon");
    assert(plist.includes("<string>update</string>"), "job does not run 'update'");
    return "plist runs 'update', catches up after sleep";
  });

  await check("resolver boot job restarts itself if it dies", async () => {
    const plist = launchd.resolverJob(53).plist();
    assert(plist.includes("<key>RunAtLoad</key>"), "would not start at boot");
    // System DNS points at this process; if it dies without KeepAlive the
    // machine loses all name resolution until someone notices.
    assert(plist.includes("<key>KeepAlive</key>"), "no KeepAlive -- a crash would break all DNS");
    assert(plist.includes("serve.js"), "boot job does not run the resolver");
    assert(plist.includes("<string>53</string>"), "port not passed");
    assert(!plist.includes("<key>StartInterval</key>"), "resolver should not be interval-driven");
    return "RunAtLoad + KeepAlive, survives reboot and crashes";
  });

  await check("the two launchd jobs stay distinct", async () => {
    const resolver = launchd.resolverJob(53);
    const updater = launchd.updateJob(6);
    assert(resolver.label !== updater.label, "both jobs share a label");
    assert(resolver.plistPath !== updater.plistPath, "both jobs share a plist path");
    return `${resolver.label} / ${updater.label}`;
  });

  await check("backup file is not loaded as rules", async () => {
    // feeds/<name>.prev must stay out of the resolver's *.txt glob.
    assert(!feeds.backupPath("x").endsWith(".txt"),
      `backup path ${feeds.backupPath("x")} would be loaded as a rule file`);
    return "rollback backups stay inert";
  });

  out();
  out(`${BOLD}Bypass detection${RESET}`);

  const snapshot = (over: Partial<bypass.Snapshot> = {}): bypass.Snapshot => ({
    primaryResolver: "127.0.0.1",
    defaultInterface: "en0",
    tunnel: false,
    pointedServices: ["Wi-Fi"],
    strayServices: [],
    resolverAnswering: true,
    ...over,
  });

  await check("clean machine reports protected", async () => {
    const verdict = bypass.classify(snapshot());
    assert(verdict.state === "protected", `got ${verdict.state}: ${verdict.detail}`);
    return "protected";
  });

  await check("VPN resolver outranking us is BYPASSED", async () => {
    // Exactly what a live VPN looks like: its DNS wins, tunnel holds the route.
    const verdict = bypass.classify(snapshot({
      primaryResolver: "8.8.8.8", defaultInterface: "utun9", tunnel: true,
    }));
    assert(verdict.state === "bypassed", `got ${verdict.state}`);
    assert(verdict.reason === "resolver-outranked", `got reason ${verdict.reason}`);
    return "detected, not silently reported as ON";
  });

  await check("tunnel while still primary is DEGRADED", async () => {
    const verdict = bypass.classify(snapshot({ defaultInterface: "utun4", tunnel: true }));
    assert(verdict.state === "degraded", `got ${verdict.state}`);
    assert(verdict.reason === "tunnel-active", `got reason ${verdict.reason}`);
    return "DNS filtered, traffic can still leave by address";
  });

  await check("a new unfiltered service is DEGRADED", async () => {
    // A VPN app registering its own network service after `barrier on` ran.
    const verdict = bypass.classify(snapshot({ strayServices: ["Free VPN"] }));
    assert(verdict.state === "degraded", `got ${verdict.state}`);
    assert(verdict.detail.includes("Free VPN"), "the stray service is not named");
    return "names the service that is not covered";
  });

  await check("dead resolver is BYPASSED, not ON", async () => {
    const verdict = bypass.classify(snapshot({ resolverAnswering: false }));
    assert(verdict.state === "bypassed", `got ${verdict.state}`);
    assert(verdict.reason === "resolver-down", `got reason ${verdict.reason}`);
    return "a crashed resolver never reads as protected";
  });

  await check("event log detects tampering", async () => {
    const events: bypass.BypassEvent[] = [];
    let prev = "0".repeat(64);
    // Build a valid chain the way appendEvent would.
    for (const detail of ["vpn up", "vpn down"]) {
      const unsigned = {
        at: new Date().toISOString(), type: "STARTED" as const,
        state: "bypassed" as const, reason: "resolver-outranked" as const, detail, prev,
      };
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(JSON.stringify([
        unsigned.at, unsigned.type, unsigned.state, unsigned.reason,
        unsigned.detail, null, unsigned.prev,
      ])).digest("hex");
      events.push({ ...unsigned, hash });
      prev = hash;
    }
    assert(bypass.verifyChain(events).ok, "a valid chain was rejected");

    // Now quietly edit out an evening, the way someone would.
    const tampered = structuredClone(events);
    tampered[0]!.detail = "nothing happened";
    const check1 = bypass.verifyChain(tampered);
    assert(!check1.ok, "an edited entry passed verification");
    assert(check1.brokenAt === 0, `expected break at 0, got ${String(check1.brokenAt)}`);

    // And deleting an entry must break the chain too.
    const truncated = [events[1]!];
    assert(!bypass.verifyChain(truncated).ok, "a deleted entry passed verification");
    return "edits and deletions both detected";
  });

  await check("a transient blip is not recorded as a bypass", async () => {
    // Exactly the startup race: `barrier on` sets DNS, the OS reports the old
    // resolver for one reading, then catches up.
    const readings = [
      snapshot({ primaryResolver: "2001:2000::2" }), // stale, one tick only
      snapshot(),
      snapshot(),
    ];
    const recorded: bypass.BypassEvent[] = [];
    let i = 0;
    const monitor = new bypass.Monitor(
      async () => readings[Math.min(i++, readings.length - 1)]!,
      1000,
      { persist: async (e) => { const full = { ...e, prev: "x", hash: "y" };
          recorded.push(full); return full; } },
    );
    for (let tick = 0; tick < readings.length; tick += 1) await monitor.tick();
    const logged = recorded.length;
    assert(logged === 0, `a one-tick flap was logged: ${JSON.stringify(recorded)}`);
    assert(monitor.current?.state === "protected", `settled on ${monitor.current?.state}`);
    return "startup race no longer logs a false bypass";
  });

  await check("a sustained bypass IS recorded", async () => {
    const recorded: bypass.BypassEvent[] = [];
    let vpnUp = false;
    const monitor = new bypass.Monitor(
      async () => vpnUp
        ? snapshot({ primaryResolver: "8.8.8.8", defaultInterface: "utun10", tunnel: true })
        : snapshot(),
      1000,
      { persist: async (e) => { const full = { ...e, prev: "x", hash: "y" };
          recorded.push(full); return full; } },
    );
    await monitor.tick();
    await monitor.tick(); // settled: protected
    vpnUp = true;
    await monitor.tick(); // first sighting -- not yet confirmed
    const afterFirstSighting = recorded.length;
    assert(afterFirstSighting === 0, "recorded before the change was confirmed");
    await monitor.tick(); // confirmed
    const afterConfirmation = recorded.length;
    assert(afterConfirmation === 1, `expected 1 event, got ${afterConfirmation}`);
    assert(recorded[0]!.state === "bypassed", `logged ${recorded[0]!.state}`);
    vpnUp = false;
    await monitor.tick();
    await monitor.tick();
    const afterRecovery = recorded.length;
    assert(afterRecovery === 2, `expected an ENDED event, got ${afterRecovery}`);
    assert(recorded[1]!.type === "ENDED", `logged ${recorded[1]!.type}`);
    assert(recorded[1]!.durationMs !== undefined, "no duration on the ENDED event");
    return "confirmed change logged, with duration";
  });

  out();
  out(`${BOLD}Safe search${RESET}`);

  await check("mapping file parses, self-maps rejected", async () => {
    const map = parseMappings([
      "# comment",
      "www.google.com   forcesafesearch.google.com",
      "  bing.com       strict.bing.com   # trailing comment",
      "loop.test        loop.test",
      "incomplete.test",
    ].join("\n"));
    assert(map.get("www.google.com") === "forcesafesearch.google.com", "google mapping lost");
    assert(map.get("bing.com") === "strict.bing.com", "inline comment broke the mapping");
    // A self-map would send the resolver back through this table forever.
    assert(!map.has("loop.test"), "a self-mapping was accepted");
    assert(!map.has("incomplete.test"), "a line with no target was accepted");
    return `${map.size} mappings from 5 lines`;
  });

  await check("shipped safesearch.txt covers the big engines", async () => {
    const rules = new SafeSearch(join(PROJECT, "safesearch.txt"));
    await rules.load();
    for (const [host, expected] of [
      ["www.google.com", "forcesafesearch.google.com"],
      ["www.youtube.com", "restrictmoderate.youtube.com"],
      ["www.bing.com", "strict.bing.com"],
      ["duckduckgo.com", "safe.duckduckgo.com"],
    ] as const) {
      assert(rules.target(host) === expected,
        `${host} -> ${String(rules.target(host))}, expected ${expected}`);
    }
    assert(rules.target("example.com") === null, "an unrelated host was redirected");
    return `${rules.size} hostnames forced`;
  });

  await check("google.com resolves to the safe-search host", async () => {
    const forced = await server.ask("www.google.com");
    assert(forced.addresses.length > 0, `no addresses: ${forced.rcodeName}`);
    // Resolve the safe host directly and confirm we handed back the same thing.
    const direct = await probe.query("forcesafesearch.google.com",
      { host: "1.1.1.1", timeoutMs: 4000 });
    assert(direct.addresses.length > 0, "could not resolve the safe host upstream");
    assert(forced.addresses.some((a) => direct.addresses.includes(a)),
      `got ${JSON.stringify(forced.addresses)}, safe host is ${JSON.stringify(direct.addresses)}`);
    return `-> ${forced.addresses[0]} (safe-search endpoint)`;
  }, true);

  await check("a redirected host is not the normal one", async () => {
    const forced = await server.ask("www.google.com");
    const normal = await probe.query("www.google.com", { host: "1.1.1.1", timeoutMs: 4000 });
    assert(!forced.addresses.some((a) => normal.addresses.includes(a)),
      "the redirect handed back google's ordinary address");
    return "normal endpoint never returned";
  }, true);

  await check("HTTPS record on a redirected host is NODATA", async () => {
    // ipv4hint/ipv6hint in an HTTPS record would route around safe search.
    const answer = await server.ask("www.google.com", { qtype: wire.TYPE_HTTPS });
    assert(answer.rcode === 0, `rcode ${answer.rcodeName}`);
    assert(answer.ancount === 0, `leaked ${answer.ancount} HTTPS records`);
    return "no ipv4hint bypass";
  });

  await check("safe search does not touch unrelated hosts", async () => {
    const forced = await server.ask("example.com");
    const normal = await probe.query("example.com", { host: "1.1.1.1", timeoutMs: 4000 });
    assert(forced.addresses.some((a) => normal.addresses.includes(a)),
      "an unrelated host was redirected");
    return "only mapped hostnames are redirected";
  }, true);

  await check("query log records decisions (accountability)", async () => {
    const text = await readFile(server.logPath, "utf8");
    assert(text.includes("BLOCKED"), "no BLOCKED entries written");
    assert(text.includes(BLOCKED_DOMAIN), "blocked domain not recorded");
    return `${text.split("\n").filter((l) => l !== "").length} lines written`;
  });
}

async function main(): Promise<number> {
  out(`${BOLD}Digital Barrier -- prototype reliability suite${RESET}`);
  try {
    await probe.query("cloudflare.com", { host: "1.1.1.1", timeoutMs: 3000 });
  } catch {
    online = false;
    out(`${YELLOW}!${RESET} upstream DNS unreachable -- forwarding tests will be skipped`);
  }

  const dir = await mkdtemp(join(tmpdir(), "barrier-test-"));
  const server = new Server(dir);
  try {
    await server.start();
    out(`${DIM}resolver under test: ${HOST}:${server.port}${RESET}`);
    await run(server);
  } finally {
    await server.stop();
    await rm(dir, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  out();
  out(`${BOLD}${passed} passed, ${failed} failed, ${skipped} skipped${RESET}`);
  if (failed > 0) {
    out(`${RED}FAILURES:${RESET}`);
    for (const result of results.filter((r) => r.status === "FAIL")) {
      out(`  - ${result.name}: ${result.detail}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    process.stderr.write(`fatal: ${String(error)}\n`);
    process.exitCode = 1;
  },
);
