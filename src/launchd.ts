/**
 * launchd jobs: the resolver (so protection survives a reboot) and the feed
 * updater.
 *
 * launchd rather than cron on purpose: cron simply skips a run whose scheduled
 * time passed while the machine was asleep, which on a laptop is most of them.
 * launchd runs a missed interval job when the machine wakes.
 *
 * Both are LaunchDaemons (root) rather than LaunchAgents: the resolver has to
 * bind port 53, and the updater has to signal it.
 */

import { execFile } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { appDir, distDir, invokingUser, projectDir, resolverLog } from "./state.js";

const execFileAsync = promisify(execFile);

export const RESOLVER_LABEL = "com.digitalbarrier.resolver";
export const UPDATE_LABEL = "com.digitalbarrier.update";
export const DEFAULT_INTERVAL_HOURS = 6;

export interface LaunchJob {
  label: string;
  plistPath: string;
  plist: () => string;
}

const escape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const plistPathFor = (label: string): string => `/Library/LaunchDaemons/${label}.plist`;

function buildPlist(options: {
  label: string;
  args: string[];
  logPath: string;
  extra: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${options.label}</string>
  <key>ProgramArguments</key>
  <array>
${options.args.map((arg) => `    <string>${escape(arg)}</string>`).join("\n")}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BARRIER_USER</key>
    <string>${escape(invokingUser())}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${escape(projectDir())}</string>
${options.extra}
  <key>StandardOutPath</key>
  <string>${escape(options.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escape(options.logPath)}</string>
</dict>
</plist>
`;
}

/**
 * The resolver job. `KeepAlive` matters more than usual here: while protection
 * is on, system DNS points at this process, so if it dies the machine loses all
 * name resolution. launchd restarting it is the difference between a blip and
 * an outage.
 */
export function resolverJob(port: number, host = "127.0.0.1"): LaunchJob {
  return {
    label: RESOLVER_LABEL,
    plistPath: plistPathFor(RESOLVER_LABEL),
    plist: () => buildPlist({
      label: RESOLVER_LABEL,
      args: [process.execPath, join(distDir(), "serve.js"),
        "--host", host, "--port", String(port)],
      logPath: resolverLog(),
      extra: "  <key>RunAtLoad</key>\n  <true/>\n  <key>KeepAlive</key>\n  <true/>",
    }),
  };
}

export function updateJob(intervalHours: number): LaunchJob {
  return {
    label: UPDATE_LABEL,
    plistPath: plistPathFor(UPDATE_LABEL),
    plist: () => buildPlist({
      label: UPDATE_LABEL,
      args: [process.execPath, join(distDir(), "cli.js"), "update"],
      logPath: join(appDir(), "update-daemon.log"),
      extra: `  <key>StartInterval</key>\n  <integer>${Math.round(intervalHours * 3600)}</integer>` +
        "\n  <key>RunAtLoad</key>\n  <true/>",
    }),
  };
}

async function launchctl(args: string[]): Promise<{ ok: boolean; message: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("launchctl", args);
    return { ok: true, message: (stderr || stdout).trim() };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      message: (failure.stderr ?? failure.stdout ?? failure.message ?? String(error)).trim(),
    };
  }
}

export const isInstalled = (job: LaunchJob): boolean => existsSync(job.plistPath);

export async function isLoaded(job: LaunchJob): Promise<boolean> {
  return (await launchctl(["print", `system/${job.label}`])).ok;
}

/** The pid launchd reports for a running job, if any. */
export async function pidOf(job: LaunchJob): Promise<number | null> {
  const result = await launchctl(["print", `system/${job.label}`]);
  if (!result.ok) return null;
  const match = /\bpid = (\d+)/.exec(result.message);
  return match?.[1] !== undefined ? Number(match[1]) : null;
}

export async function write(job: LaunchJob): Promise<void> {
  await writeFile(job.plistPath, job.plist(), "utf8");
  chmodSync(job.plistPath, 0o644);
}

/** Write the plist and load it. `enable` clears any prior `disable`. */
export async function load(job: LaunchJob): Promise<void> {
  await launchctl(["enable", `system/${job.label}`]);
  await launchctl(["bootout", `system/${job.label}`]);
  const result = await launchctl(["bootstrap", "system", job.plistPath]);
  if (!result.ok) {
    // Older macOS releases only understand load/unload.
    const legacy = await launchctl(["load", "-w", job.plistPath]);
    if (!legacy.ok) {
      throw new Error(`launchctl refused the job: ${result.message || legacy.message}`);
    }
  }
}

/**
 * Stop the job and keep it stopped across reboots.
 *
 * `bootout` alone only affects this boot -- the plist would be loaded again at
 * the next one. `disable` is what persists, so `barrier off` really means off.
 */
export async function unload(job: LaunchJob): Promise<void> {
  await launchctl(["bootout", `system/${job.label}`]);
  await launchctl(["disable", `system/${job.label}`]);
}

export async function remove(job: LaunchJob): Promise<boolean> {
  const wasInstalled = isInstalled(job);
  await launchctl(["bootout", `system/${job.label}`]);
  await launchctl(["enable", `system/${job.label}`]); // leave no stale disable behind
  if (wasInstalled) {
    await launchctl(["unload", "-w", job.plistPath]);
    await unlink(job.plistPath).catch(() => {});
  }
  return wasInstalled;
}

export async function restart(job: LaunchJob): Promise<void> {
  await launchctl(["kickstart", "-k", `system/${job.label}`]);
}
