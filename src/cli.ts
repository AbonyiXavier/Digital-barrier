/** Command line for the prototype: on / off / status / check / reload / log / test. */

import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

import { Blocklist } from "./blocklist.js";
import * as bypass from "./bypass.js";
import * as feeds from "./feeds.js";
import * as launchd from "./launchd.js";
import * as cloud from "./cloud/client.js";
import { clearCloud, isLinked, isPaired, patchCloud, readCloud } from "./cloud/config.js";
import { NotPairedError, sync } from "./cloud/sync.js";
import { SafeSearch } from "./safesearch.js";
import * as probe from "./probe.js";
import * as state from "./state.js";
import * as system from "./system.js";
import * as wire from "./wire.js";

const DEFAULT_PORT = 53;
const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 6000;

const tty = process.stdout.isTTY === true;
const GREEN = tty ? "\u001b[32m" : "";
const RED = tty ? "\u001b[31m" : "";
const YELLOW = tty ? "\u001b[33m" : "";
const DIM = tty ? "\u001b[2m" : "";
const BOLD = tty ? "\u001b[1m" : "";
const RESET = tty ? "\u001b[0m" : "";

const out = (text = ""): void => void process.stdout.write(`${text}\n`);

function fail(message: string): number {
  process.stderr.write(`${RED}error${RESET} ${message}\n`);
  return 1;
}

function isRoot(): boolean {
  return process.getuid?.() === 0;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function runningPid(): Promise<number | null> {
  try {
    const pid = Number((await readFile(state.pidFile(), "utf8")).trim());
    return Number.isInteger(pid) && pidAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function startDaemon(port: number): Promise<number | null> {
  const logFd = openSync(state.resolverLog(), "a");
  const child = spawn(process.execPath, [join(state.distDir(), "serve.js"),
    "--host", HOST, "--port", String(port)], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const pid = child.pid;
  if (pid === undefined) return null;
  await writeFile(state.pidFile(), String(pid), "utf8");

  let exited = false;
  child.once("exit", () => { exited = true; });

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) return null; // died on startup; resolver.log has the reason
    if (await probe.healthy(HOST, port, 500)) return pid;
    await delay(200);
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  return null;
}

/** Poll until the resolver answers, or give up. */
async function waitUntilAnswering(port: number, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe.healthy(HOST, port, 500)) return true;
    await delay(250);
  }
  return false;
}

async function stopDaemon(pid: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return true;
  }
  for (let i = 0; i < 25; i += 1) {
    if (!pidAlive(pid)) return true;
    await delay(200);
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Already gone.
  }
  return !pidAlive(pid);
}

async function commandOn(port: number): Promise<number> {
  // networksetup always needs root, and port 53 needs it to bind.
  if (!isRoot()) return fail("changing system DNS needs root. Run: sudo ./barrier on");

  const bootJob = launchd.resolverJob(port);
  const managed = launchd.isInstalled(bootJob);
  let pid: number | null;

  if (managed) {
    // launchd owns the process; `off` disables the job, so re-enable it here.
    await launchd.load(bootJob);
    if (!(await waitUntilAnswering(port))) {
      return fail(`the launchd resolver did not come up -- see ${state.resolverLog()}`);
    }
    pid = await launchd.pidOf(bootJob);
    out(`${DIM}->${RESET} resolver started by launchd on ${HOST}:${port}` +
        (pid !== null ? ` (pid ${pid})` : ""));
  } else {
    pid = await runningPid();
    if (pid !== null && (await probe.healthy(HOST, port, 1000))) {
      // Reusing a live resolver would otherwise keep serving whatever rules it
      // loaded at startup -- stale if a feed has been installed since.
      out(`${DIM}resolver already running${RESET} (pid ${pid})`);
      try {
        process.kill(pid, "SIGHUP");
        out(`${DIM}->${RESET} rules reloaded from disk`);
      } catch {
        out(`${YELLOW}!${RESET} could not reload rules in the running resolver`);
      }
    } else {
      if (pid !== null) await stopDaemon(pid);
      pid = await startDaemon(port);
      if (pid === null) return fail(`resolver failed to start -- see ${state.resolverLog()}`);
      out(`${DIM}->${RESET} resolver listening on ${HOST}:${port} (pid ${pid})`);
    }
  }

  const services = await system.networkServices();
  if (services.length === 0) return fail("no active network services found");

  // Capture the current settings BEFORE touching anything, and persist them
  // before the switch -- if this process dies mid-change, `off` can still undo.
  const existing = (await state.readState())?.dnsBackup ?? {};
  const dnsBackup: Record<string, string[]> = {};
  for (const service of services) {
    const current = await system.getDns(service);
    // Never record our own loopback as the thing to restore to.
    dnsBackup[service] =
      current.length === 1 && current[0] === system.LOOPBACK
        ? (existing[service] ?? [])
        : current;
  }
  await state.writeState({ enabled: false, port, pid: pid ?? 0, dnsBackup, startedAt: Date.now() });

  const switched: string[] = [];
  const failed: Array<{ service: string; message: string }> = [];
  for (const service of services) {
    const result = await system.setDns(service, [system.LOOPBACK]);
    if (result.ok) switched.push(service);
    else failed.push({ service, message: result.message });
  }

  if (switched.length === 0) {
    if (managed) await launchd.unload(bootJob);
    else if (pid !== null) await stopDaemon(pid);
    await state.clearState();
    return fail(`could not set DNS on any service: ${JSON.stringify(failed)}`);
  }

  await state.writeState({
    enabled: true, port, pid: pid ?? 0, dnsBackup, services: switched, startedAt: Date.now(),
  });
  await system.flushCache();

  out(`${DIM}->${RESET} system DNS -> ${system.LOOPBACK} on: ${switched.join(", ")}`);
  for (const { service, message } of failed) {
    out(`${YELLOW}!${RESET}  skipped ${service} (${message})`);
  }
  out(`${DIM}->${RESET} DNS cache flushed`);
  out();
  out(`${BOLD}${GREEN}PROTECTION ON${RESET}`);
  out(`${DIM}Verify with:${RESET} ./barrier active`);
  return 0;
}

async function commandOff(): Promise<number> {
  if (!isRoot()) return fail("changing system DNS needs root. Run: sudo ./barrier off");

  const saved = await state.readState();
  let backup = saved?.dnsBackup;

  if (backup === undefined || Object.keys(backup).length === 0) {
    // No state to work from: undo anything still pointed at our resolver.
    backup = {};
    for (const service of await system.networkServices()) {
      const current = await system.getDns(service);
      if (current.length === 1 && current[0] === system.LOOPBACK) backup[service] = [];
    }
    const count = Object.keys(backup).length;
    if (count > 0) {
      out(`${YELLOW}!${RESET} no saved state; resetting ${count} service(s) to DHCP defaults`);
    }
  }

  // Restore DNS first, then stop the resolver -- never leave the system
  // pointing at a listener that is already gone.
  for (const [service, servers] of Object.entries(backup)) {
    const result = await system.setDns(service, servers);
    const label = servers.length > 0 ? servers.join(", ") : "DHCP default";
    if (result.ok) out(`${DIM}->${RESET} ${service} restored to ${label}`);
    else out(`${YELLOW}!${RESET}  ${service} not restored (${result.message})`);
  }
  await system.flushCache();

  const bootJob = launchd.resolverJob(saved?.port ?? DEFAULT_PORT);
  if (launchd.isInstalled(bootJob)) {
    // KeepAlive would immediately revive a killed process, and bootout alone
    // only lasts until the next reboot -- unload disables it persistently.
    await launchd.unload(bootJob);
    out(`${DIM}->${RESET} resolver stopped and disabled until the next 'barrier on'`);
  } else {
    const pid = (await runningPid()) ?? saved?.pid ?? null;
    if (pid !== null && pidAlive(pid)) {
      await stopDaemon(pid);
      out(`${DIM}->${RESET} resolver stopped (pid ${pid})`);
    }
  }
  try {
    await unlink(state.pidFile());
  } catch {
    // Already gone.
  }
  await state.clearState();

  out();
  out(`${BOLD}${YELLOW}PROTECTION OFF${RESET}`);
  return 0;
}

async function commandStatus(explicitPort: number | undefined): Promise<number> {
  const saved = await state.readState();
  const port = explicitPort ?? saved?.port ?? DEFAULT_PORT;
  const pid = await runningPid();
  const answering = await probe.healthy(HOST, port, 1000);
  const enabled = saved?.enabled === true && answering;

  if (!enabled) {
    out(`${BOLD}${YELLOW}PROTECTION OFF${RESET}`);
  } else {
    // Enabled is not the same as effective: a VPN can route around us while
    // every setting still looks correct.
    const verdict = bypass.classify(await bypass.sense(answering));
    if (verdict.state === "protected") {
      out(`${BOLD}${GREEN}PROTECTION ON${RESET}`);
    } else if (verdict.state === "degraded") {
      out(`${BOLD}${YELLOW}PROTECTION DEGRADED${RESET} -- ${verdict.detail}`);
    } else {
      out(`${BOLD}${RED}PROTECTION BYPASSED${RESET} -- ${verdict.detail}`);
    }
    const events = await bypass.readEvents();
    const last = events[events.length - 1];
    if (verdict.state !== "protected" && last !== undefined && last.type !== "ENDED") {
      out(`  ${DIM}since ${formatAge(last.at)}${RESET}`);
    }
  }

  let detail: string;
  if (pid !== null && answering) detail = `running, pid ${pid}, answering on ${HOST}:${port}`;
  else if (pid !== null) detail = `pid ${pid} alive but NOT answering on ${HOST}:${port}`;
  else if (answering) detail = `answering on ${HOST}:${port} (started outside this CLI)`;
  else detail = "not running";
  out(`  resolver     ${detail}`);

  const rules = new Blocklist(state.blockSources(), state.allowPath());
  const counts = await rules.load();
  out(`  rules        ${counts.blocked} blocked, ${counts.allowed} allowlisted`);
  const safeSearchRules = new SafeSearch(state.safeSearchPath());
  const safeSearchCount = await safeSearchRules.load();
  out(safeSearchCount > 0
    ? `  safe search  ${GREEN}forced${RESET} on ${safeSearchCount} hostnames`
    : `  safe search  ${DIM}off -- see safesearch.txt${RESET}`);
  const installedFeeds = await feeds.installed();
  if (installedFeeds.length === 0) {
    out(`  feeds        ${DIM}none installed -- run: ./barrier update${RESET}`);
  } else {
    for (const meta of installedFeeds) {
      out(`  feed         ${meta.name} (${meta.entries} domains, fetched ${formatAge(meta.fetchedAt)})`);
    }
  }

  // An updater that fails quietly is the real hazard: you keep believing you
  // are protected while the list goes stale. Say so on every status check.
  const history = await feeds.readHistory();
  const failures = feeds.consecutiveFailures(history);
  const last = history[history.length - 1];
  if (last !== undefined) {
    if (failures > 0) {
      out(`  updates      ${RED}${failures} consecutive failure(s)${RESET}, ` +
          `last tried ${formatAge(last.at)}: ${last.error ?? "unknown error"}`);
    } else {
      out(`  updates      last succeeded ${formatAge(last.at)}` +
          `${last.unchanged === true ? " (feed unchanged)" : ""}`);
    }
  }

  const updateJob = launchd.updateJob(launchd.DEFAULT_INTERVAL_HOURS);
  if (!launchd.isInstalled(updateJob)) {
    out(`  auto-update  ${DIM}not scheduled -- run: sudo ./barrier schedule${RESET}`);
  } else {
    const loaded = await launchd.isLoaded(updateJob);
    out(`  auto-update  ${loaded ? `${GREEN}active${RESET}` : `${YELLOW}installed but not loaded${RESET}`}`);
  }

  const bootJob = launchd.resolverJob(port);
  if (!launchd.isInstalled(bootJob)) {
    out(`  at boot      ${YELLOW}no${RESET} ${DIM}-- a reboot with protection on breaks all DNS. ` +
        `Run: sudo ./barrier install${RESET}`);
  } else {
    const loaded = await launchd.isLoaded(bootJob);
    out(`  at boot      ${loaded ? `${GREEN}yes, managed by launchd${RESET}`
      : `${YELLOW}installed but not loaded${RESET}`}`);
  }
  out(`  system DNS   ${(await system.activeResolver()) ?? "unknown"}`);
  for (const service of await system.networkServices()) {
    const servers = await system.getDns(service);
    const pointed = servers.length === 1 && servers[0] === system.LOOPBACK;
    const mark = pointed ? `${GREEN}*${RESET}` : " ";
    out(`   ${mark} ${service.padEnd(24)} ${servers.join(", ") || "DHCP default"}`);
  }

  // The backend link. Shown here because "protected locally" and "known to the
  // account" are different facts, and a device that silently stopped syncing is
  // exactly the case this command exists to surface.
  const cloudConfig = await readCloud();
  if (!isLinked(cloudConfig)) {
    out(`  account      ${DIM}not signed in -- run: ./barrier login${RESET}`);
  } else if (!isPaired(cloudConfig)) {
    out(`  account      ${YELLOW}${cloudConfig.email ?? "signed in"}, not paired${RESET} ` +
        `${DIM}-- run: ./barrier pair <code>${RESET}`);
  } else {
    const synced =
      cloudConfig.lastSyncAt !== undefined ? formatAge(cloudConfig.lastSyncAt) : "never";
    const stale =
      cloudConfig.lastSyncAt === undefined ||
      Date.now() - Date.parse(cloudConfig.lastSyncAt) > 24 * 60 * 60 * 1000;
    out(`  account      ${GREEN}${cloudConfig.email ?? "linked"}${RESET} ` +
        `${DIM}(device ${cloudConfig.deviceId?.slice(0, 8)}…, synced ${synced})${RESET}`);
    if (stale) {
      out(`  ${YELLOW}!${RESET}            last sync ${synced} -- run: ./barrier sync`);
    }
  }

  const log = await logCounts();
  if (log !== null) {
    out(`  queries      ${log.total} total, ${RED}${log.blocked} blocked${RESET} (${state.queryLog()})`);
  }
  return 0;
}

async function logCounts(): Promise<{ total: number; blocked: number } | null> {
  try {
    const lines = (await readFile(state.queryLog(), "utf8")).split("\n").filter((l) => l !== "");
    return {
      total: lines.length,
      blocked: lines.filter((line) => line.includes(" BLOCKED ")).length,
    };
  } catch {
    return null;
  }
}

async function commandCheck(domains: string[], explicitPort: number | undefined): Promise<number> {
  const port = explicitPort ?? (await state.readState())?.port ?? DEFAULT_PORT;
  const safeSearchRules = new SafeSearch(state.safeSearchPath());
  await safeSearchRules.load();
  let exitCode = 0;
  for (const name of domains) {
    try {
      const answer = await probe.query(name, { host: HOST, port, qtype: wire.TYPE_A, timeoutMs: 4000 });
      const sinkholed = answer.addresses.length === 1 && answer.addresses[0] === "0.0.0.0";
      if (sinkholed) {
        out(`  ${RED}${name.padEnd(32)} BLOCKED${RESET} -> 0.0.0.0`);
        continue;
      }
      const detail = answer.addresses.join(", ") || answer.rcodeName;
      const target = safeSearchRules.target(name);
      if (target !== null) {
        out(`  ${YELLOW}${name.padEnd(32)} SAFESEARCH${RESET} -> ${target} (${detail})`);
      } else {
        out(`  ${GREEN}${name.padEnd(32)} ALLOWED${RESET} -> ${detail}`);
      }
    } catch (error) {
      out(`  ${RED}${name.padEnd(32)} ERROR${RESET} ${error instanceof Error ? error.message : String(error)}`);
      exitCode = 1;
    }
  }
  return exitCode;
}

async function commandReload(): Promise<number> {
  const pid = await runningPid();
  if (pid === null) return fail("resolver is not running");
  if (!signalDaemon(pid, "SIGHUP")) return 1;
  const counts = await new Blocklist(state.blockSources(), state.allowPath()).load();
  const safeSearchCount = await new SafeSearch(state.safeSearchPath()).load();
  out(`reloaded: ${counts.blocked} blocked, ${counts.allowed} allowlisted, ` +
      `${safeSearchCount} safe-search`);
  return 0;
}

/**
 * The resolver runs as root (it binds port 53), so a normal user cannot signal
 * it. Say that plainly instead of surfacing a raw EPERM.
 */
function signalDaemon(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      fail(`the resolver (pid ${pid}) runs as root. Run: sudo ./barrier reload`);
      return false;
    }
    fail(`could not signal the resolver: ${String(error)}`);
    return false;
  }
}

function formatAge(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

async function commandSources(): Promise<number> {
  out(`${BOLD}Known sources${RESET}`);
  for (const [name, source] of Object.entries(feeds.SOURCES)) {
    const marker = name === feeds.DEFAULT_SOURCE ? `${GREEN}*${RESET}` : " ";
    out(`  ${marker} ${name.padEnd(20)} ${source.description}`);
    out(`    ${DIM}${source.url}${RESET}`);
  }
  const current = await feeds.installed();
  out();
  out(`${BOLD}Installed${RESET}`);
  if (current.length === 0) {
    out(`  ${DIM}none -- run: ./barrier update${RESET}`);
    return 0;
  }
  for (const meta of current) {
    out(`    ${meta.name.padEnd(20)} ${String(meta.entries).padStart(7)} domains, ` +
        `fetched ${formatAge(meta.fetchedAt)}`);
  }
  return 0;
}

async function commandUpdate(target: string | undefined, url: string | undefined,
                             name: string | undefined, force: boolean): Promise<number> {
  let feedName: string;
  let feedUrl: string;

  if (url !== undefined) {
    feedName = name ?? target ?? "custom";
    feedUrl = url;
  } else if (target === undefined) {
    const current = await feeds.installed();
    // With no argument, refresh what is already installed, else install the default.
    if (current.length > 0) {
      let failures = 0;
      for (const meta of current) {
        failures += await installOne(meta.name, meta.url, force);
      }
      return failures > 0 ? 1 : await reloadAfterUpdate();
    }
    feedName = feeds.DEFAULT_SOURCE;
    feedUrl = feeds.SOURCES[feeds.DEFAULT_SOURCE]!.url;
  } else {
    const source = feeds.SOURCES[target];
    if (source === undefined) {
      return fail(`unknown source: ${target}\n` +
        `Known: ${Object.keys(feeds.SOURCES).join(", ")}\n` +
        `Or supply your own: ./barrier update --url <url> --name <name>`);
    }
    feedName = target;
    feedUrl = source.url;
  }

  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(feedName)) {
    return fail(`invalid feed name: ${feedName}`);
  }
  if (await installOne(feedName, feedUrl, force) > 0) return 1;
  return await reloadAfterUpdate();
}

/** Returns 0 on success, 1 on failure, so callers can count. */
async function installOne(feedName: string, feedUrl: string, force: boolean): Promise<number> {
  out(`${DIM}->${RESET} fetching ${feedName} from ${feedUrl}`);
  try {
    const { meta, unchanged } = await feeds.install(feedName, feedUrl, { force });
    if (unchanged) {
      out(`${DIM}->${RESET} unchanged (sha256 ${meta.sha256.slice(0, 12)}), ${meta.entries} domains`);
    } else {
      const delta = meta.previousEntries !== undefined
        ? ` (${meta.previousEntries} -> ${meta.entries})`
        : "";
      out(`${DIM}->${RESET} validated ${meta.entries} domains${delta} ` +
          `(${(meta.bytes / 1024 / 1024).toFixed(1)} MB, sha256 ${meta.sha256.slice(0, 12)})`);
      out(`${GREEN}installed${RESET} ${feeds.feedPath(feedName)}`);
    }
    await feeds.recordAttempt({
      at: new Date().toISOString(), name: feedName, url: feedUrl,
      ok: true, entries: meta.entries, unchanged,
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await feeds.recordAttempt({
      at: new Date().toISOString(), name: feedName, url: feedUrl, ok: false, error: message,
    });
    if (error instanceof feeds.FeedError) {
      fail(message);
      return 1;
    }
    throw error;
  }
}

async function reloadAfterUpdate(): Promise<number> {
  const counts = await new Blocklist(state.blockSources(), state.allowPath()).load();
  out(`${DIM}->${RESET} ${counts.blocked} domains blocked in total`);

  const pid = await runningPid();
  if (pid === null) {
    out(`${DIM}Resolver is not running; rules apply next time you run 'barrier on'.${RESET}`);
    return 0;
  }
  try {
    process.kill(pid, "SIGHUP");
    out(`${DIM}->${RESET} resolver reloaded (pid ${pid})`);
    return 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      out(`${YELLOW}!${RESET} resolver runs as root -- apply with: sudo ./barrier reload`);
      return 0;
    }
    return fail(`could not reload the resolver: ${String(error)}`);
  }
}

async function commandLog(count: number, follow: boolean): Promise<number> {
  const path = state.queryLog();
  if (follow) {
    return await new Promise<number>((done) => {
      const child = spawn("tail", ["-f", path], { stdio: "inherit" });
      child.on("exit", (code) => done(code ?? 0));
    });
  }
  try {
    const lines = (await readFile(path, "utf8")).split("\n").filter((l) => l !== "");
    for (const line of lines.slice(-count)) out(line);
  } catch {
    out(`no queries logged yet (${path})`);
  }
  return 0;
}

async function commandTest(): Promise<number> {
  return await new Promise<number>((done) => {
    const child = spawn(process.execPath,
      [join(state.distDir(), "..", "tests", "prototype.test.js")], { stdio: "inherit" });
    child.on("exit", (code) => done(code ?? 1));
  });
}

async function commandRollback(name: string | undefined): Promise<number> {
  const target = name ?? (await feeds.installed())[0]?.name;
  if (target === undefined) return fail("no feed installed to roll back");
  try {
    const entries = await feeds.rollback(target);
    out(`${GREEN}rolled back${RESET} ${target} to its previous version (${entries} domains)`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  return await reloadAfterUpdate();
}

async function commandSchedule(hours: number): Promise<number> {
  if (!isRoot()) {
    return fail("installing a LaunchDaemon needs root. Run: sudo ./barrier schedule");
  }
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 168) {
    return fail("--hours must be between 0.25 and 168");
  }
  const job = launchd.updateJob(hours);
  try {
    await launchd.write(job);
    await launchd.load(job);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  out(`${GREEN}scheduled${RESET} ${job.label} every ${hours}h`);
  out(`  ${DIM}plist   ${job.plistPath}${RESET}`);
  out(`  ${DIM}log     ${join(state.appDir(), "update-daemon.log")}${RESET}`);
  out(`  ${DIM}Runs as root and catches up after sleep, unlike cron.${RESET}`);
  return 0;
}

async function commandUnschedule(): Promise<number> {
  if (!isRoot()) {
    return fail("removing a LaunchDaemon needs root. Run: sudo ./barrier unschedule");
  }
  const removed = await launchd.remove(launchd.updateJob(launchd.DEFAULT_INTERVAL_HOURS));
  out(removed ? `${GREEN}unscheduled${RESET} ${launchd.UPDATE_LABEL}`
    : "no scheduled update job was installed");
  return 0;
}

/**
 * Install the resolver as a boot daemon.
 *
 * The hazard this closes: with protection on, system DNS points at 127.0.0.1.
 * Before this, a reboot left nothing listening there, so every lookup on the
 * machine failed until someone ran `barrier on` -- with no obvious cause.
 */
async function commandInstall(port: number): Promise<number> {
  if (!isRoot()) {
    return fail("installing a LaunchDaemon needs root. Run: sudo ./barrier install");
  }
  // A hand-spawned resolver would fight the daemon for port 53.
  const stray = await runningPid();
  if (stray !== null) {
    await stopDaemon(stray);
    await unlink(state.pidFile()).catch(() => {});
    out(`${DIM}->${RESET} stopped the hand-started resolver (pid ${stray})`);
  }

  const job = launchd.resolverJob(port);
  try {
    await launchd.write(job);
    await launchd.load(job);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  // Never report success on an unverified install: system DNS may already point
  // here, and a daemon that cannot start would take all name resolution with it.
  if (!(await waitUntilAnswering(port))) {
    await launchd.remove(job);
    return fail(`the daemon did not come up on ${HOST}:${port} -- install rolled back. ` +
      `See ${state.resolverLog()}`);
  }

  out(`${GREEN}installed${RESET} ${job.label}`);
  out(`  ${DIM}plist   ${job.plistPath}${RESET}`);
  out(`  ${DIM}The resolver now starts at boot and restarts if it dies.${RESET}`);
  out(`  ${DIM}'barrier off' disables it across reboots; 'barrier on' re-enables it.${RESET}`);
  return 0;
}

async function commandUninstall(port: number): Promise<number> {
  if (!isRoot()) {
    return fail("removing a LaunchDaemon needs root. Run: sudo ./barrier uninstall");
  }
  const removed = await launchd.remove(launchd.resolverJob(port));
  if (!removed) {
    out("no resolver daemon was installed");
    return 0;
  }
  out(`${GREEN}uninstalled${RESET} ${launchd.RESOLVER_LABEL}`);
  const saved = await state.readState();
  if (saved?.enabled === true) {
    out(`${YELLOW}!${RESET} protection is still on and nothing is listening now.`);
    out(`  ${DIM}Run 'sudo ./barrier on' to restart it, or 'sudo ./barrier off' to stand down.${RESET}`);
  }
  return 0;
}

async function commandEvents(count: number): Promise<number> {
  const events = await bypass.readEvents();
  if (events.length === 0) {
    out(`no bypass events recorded (${state.bypassLog()})`);
    return 0;
  }
  const chain = bypass.verifyChain(events);
  for (const event of events.slice(-count)) {
    const colour = event.state === "protected" ? GREEN
      : event.state === "degraded" ? YELLOW : RED;
    const duration = event.durationMs !== undefined
      ? ` ${DIM}after ${formatDuration(event.durationMs)}${RESET}`
      : "";
    out(`${event.at.slice(0, 19).replace("T", " ")}  ${colour}${event.type.padEnd(8)}` +
        `${event.state.padEnd(10)}${RESET} ${event.detail}${duration}`);
  }
  out();
  if (chain.ok) {
    out(`${GREEN}chain intact${RESET} ${DIM}(${events.length} events, none removed or altered)${RESET}`);
  } else {
    out(`${RED}CHAIN BROKEN at entry ${chain.brokenAt}${RESET} -- the log was edited or truncated`);
    return 1;
  }
  return 0;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, "0")}m`;
}

/** Reads a line without echoing it, so a password never lands in the scrollback. */
async function promptHidden(question: string): Promise<string> {
  const { createInterface } = await import("node:readline");
  process.stdout.write(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // readline echoes by default; muting its writer is the documented way to stop it.
  const muted = rl as unknown as { _writeToOutput?: (text: string) => void };
  const previous = muted._writeToOutput;
  muted._writeToOutput = () => {};

  return new Promise((resolve) => {
    rl.question("", (answer) => {
      muted._writeToOutput = previous;
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function prompt(question: string): Promise<string> {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Turns an API failure into one line a person can act on. */
function explain(error: unknown): string {
  if (error instanceof cloud.OfflineError) return `${error.message} Is the API running?`;
  if (error instanceof cloud.ApiError) {
    if (error.status === 401) return "Those credentials were not accepted.";
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof NotPairedError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

async function commandLogin(emailFlag: string | undefined): Promise<number> {
  const config = await readCloud();
  out(`${DIM}api${RESET} ${config.apiUrl}`);
  const email = emailFlag ?? (await prompt("Email: "));
  if (email === "") return fail("An email is required.");
  const password = await promptHidden("Password: ");
  if (password === "") return fail("A password is required.");

  try {
    const user = await cloud.signIn(email, password);
    out(`${GREEN}signed in${RESET} as ${user.email}`);
    out(`${DIM}Next:${RESET} open the app, go to Devices -> Add device, then run:`);
    out(`  ./barrier pair <code>`);
    return 0;
  } catch (error) {
    return fail(explain(error));
  }
}

async function commandLogout(): Promise<number> {
  const config = await readCloud();
  if (!isLinked(config)) {
    out("not signed in");
    return 0;
  }
  await cloud.signOut();
  await clearCloud();
  out(`${GREEN}signed out${RESET} — this device is no longer linked`);
  out(`${DIM}Protection keeps running locally until you run: sudo ./barrier off${RESET}`);
  return 0;
}

async function commandPair(code: string | undefined, nameFlag: string | undefined): Promise<number> {
  const config = await readCloud();
  if (!isLinked(config)) return fail("Sign in first: ./barrier login");
  if (code === undefined || code === "") {
    return fail("A pairing code is required: ./barrier pair <code>  (get one in the app)");
  }

  const { hostname } = await import("node:os");
  const name = nameFlag ?? hostname().replace(/\.local$/, "");

  try {
    const device = await cloud.claimPairingCode(code, name);
    await patchCloud({ deviceId: device.id });
    out(`${GREEN}paired${RESET} as "${device.name}" (${device.platform}, ${device.status})`);
    out(`${DIM}Now run:${RESET} ./barrier sync`);
    return 0;
  } catch (error) {
    if (error instanceof cloud.ApiError && error.status === 402) {
      fail(error.message);
      out(`${DIM}The free plan covers one device. Upgrade in the app, or remove another device.${RESET}`);
      return 1;
    }
    return fail(explain(error));
  }
}

async function commandSync(): Promise<number> {
  try {
    const outcome = await sync();
    const c = outcome.config;
    out(`${DIM}->${RESET} checked in as ${c.deviceId} (${c.status})`);
    out(`${DIM}->${RESET} server policy: protection ${c.protectionOn ? "ON" : "OFF"}, ` +
        `categories: ${c.enabledCategories.join(", ") || "none"}`);
    out(`${DIM}->${RESET} allowlist: ${outcome.allowed} entr${outcome.allowed === 1 ? "y" : "ies"} from the server`);
    if (outcome.reported.length > 0) {
      out(`${DIM}->${RESET} reported ${outcome.reported.map((r) => `${r.day}=${r.count}`).join(", ")}`);
    } else {
      out(`${DIM}->${RESET} nothing new to report`);
    }

    if (outcome.drift !== null) {
      out("");
      out(`${YELLOW}!${RESET} ${outcome.drift}`);
      return 1;
    }
    out("");
    out(`${GREEN}in sync${RESET}`);
    return 0;
  } catch (error) {
    return fail(explain(error));
  }
}

const USAGE = `barrier -- Digital Barrier, DNS-level content filter

Usage: barrier [--port <n>] <command>

Commands:
  on                  enable protection (needs sudo)
  off                 disable protection (needs sudo)
  status              show current state
  login [--email]     sign in to the backend
  logout              unlink this device
  pair <code>         claim a pairing code from the app
  sync                take the server's policy, push block counts
  check <domain>...   resolve domains through the filter
  update [<source>]   download/refresh a maintained blocklist feed
  rollback [<feed>]   restore the previous version of a feed
  install             run the resolver at boot, via launchd (needs sudo)
  uninstall           stop running the resolver at boot (needs sudo)
  schedule [--hours]  install the automatic update job (needs sudo)
  unschedule          remove the automatic update job (needs sudo)
  sources             list known feeds and what is installed
  reload              re-read the rule files
  log [-n <n>] [-f]   show the query log
  events [-n <n>]     show bypass events (VPN, DNS changes) and verify the log
  test                run the reliability test suite

Options:
  --port <n>          resolver port (default ${DEFAULT_PORT})
  --url <url>         custom feed URL for 'update'
  --name <name>       name to install a custom feed under
  --force             accept a feed that shrank sharply
  --hours <n>         update interval for 'schedule' (default ${launchd.DEFAULT_INTERVAL_HOURS})
  -n, --number <n>    log lines to show (default 25)
  -f, --follow        follow the log
  -h, --help          show this help
`;

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        port: { type: "string" },
        url: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
        hours: { type: "string" },
        force: { type: "boolean", default: false },
        number: { type: "string", short: "n" },
        follow: { type: "boolean", short: "f", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const { values, positionals } = parsed;
  const command = positionals[0];
  if (values.help === true || command === undefined) {
    out(USAGE);
    return command === undefined && values.help !== true ? 1 : 0;
  }

  // Undefined means "no explicit --port": each command then falls back to the
  // saved state, and only then to the default.
  let port: number | undefined;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return fail(`invalid port: ${String(values.port)}`);
    }
  }

  switch (command) {
    case "on": return await commandOn(port ?? DEFAULT_PORT);
    case "off": return await commandOff();
    case "status": return await commandStatus(port);
    case "login": return await commandLogin(values.email);
    case "logout": return await commandLogout();
    case "pair": return await commandPair(positionals[1], values.name);
    case "sync": return await commandSync();
    case "check": {
      const domains = positionals.slice(1);
      if (domains.length === 0) return fail("check needs at least one domain");
      return await commandCheck(domains, port);
    }
    case "reload": return await commandReload();
    case "update":
      return await commandUpdate(positionals[1], values.url, values.name, values.force === true);
    case "rollback": return await commandRollback(positionals[1]);
    case "schedule":
      return await commandSchedule(values.hours !== undefined
        ? Number(values.hours) : launchd.DEFAULT_INTERVAL_HOURS);
    case "unschedule": return await commandUnschedule();
    case "install": return await commandInstall(port ?? DEFAULT_PORT);
    case "uninstall": return await commandUninstall(port ?? DEFAULT_PORT);
    case "events": {
      const count = values.number !== undefined ? Number(values.number) : 25;
      if (!Number.isInteger(count) || count < 1) return fail("-n must be a positive integer");
      return await commandEvents(count);
    }
    case "sources": return await commandSources();
    case "log": {
      const count = values.number !== undefined ? Number(values.number) : 25;
      if (!Number.isInteger(count) || count < 1) return fail("-n must be a positive integer");
      return await commandLog(count, values.follow === true);
    }
    case "test": return await commandTest();
    default:
      return fail(`unknown command: ${command}\n\n${USAGE}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    process.stderr.write(`fatal: ${String(error)}\n`);
    process.exitCode = 1;
  },
);
