/**
 * macOS system DNS control via networksetup.
 *
 * Turning protection on means pointing every active network service at
 * 127.0.0.1. The previous settings are captured first so `barrier off` can put
 * them back exactly, including the "no DNS servers set" case (DHCP-provided),
 * which networksetup spells as the literal argument `empty`.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const LOOPBACK = "127.0.0.1";
const NO_SERVERS = /There aren't any DNS Servers set/i;

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function run(command: string, args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args);
    return { ok: true, stdout, stderr };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message ?? String(error),
    };
  }
}

/** Active (non-disabled) network service names, in macOS priority order. */
export async function networkServices(): Promise<string[]> {
  const result = await run("networksetup", ["-listallnetworkservices"]);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .slice(1) // first line is a legend
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("*")); // * marks disabled
}

/** Current DNS servers for a service; [] means "inherit from DHCP". */
export async function getDns(service: string): Promise<string[]> {
  const result = await run("networksetup", ["-getdnsservers", service]);
  if (!result.ok || NO_SERVERS.test(result.stdout)) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}

/** Set DNS servers; an empty list restores DHCP defaults. */
export async function setDns(
  service: string,
  servers: string[],
): Promise<{ ok: boolean; message: string }> {
  const args = ["-setdnsservers", service, ...(servers.length > 0 ? servers : ["empty"])];
  const result = await run("networksetup", args);
  return { ok: result.ok, message: (result.stderr || result.stdout).trim() };
}

/** Drop the OS resolver cache so a toggle takes effect immediately. */
export async function flushCache(): Promise<boolean> {
  await run("dscacheutil", ["-flushcache"]);
  const result = await run("killall", ["-HUP", "mDNSResponder"]);
  return result.ok;
}

/**
 * The interface carrying the default route. A `utun`/`ipsec`/`ppp` interface
 * means a tunnel holds it, so traffic can leave without consulting our filter.
 */
export async function defaultRouteInterface(): Promise<string | null> {
  const result = await run("route", ["-n", "get", "default"]);
  for (const line of result.stdout.split("\n")) {
    const match = /^\s*interface:\s*(\S+)/.exec(line);
    if (match?.[1] !== undefined) return match[1];
  }
  return null;
}

export function isTunnel(iface: string | null): boolean {
  return iface !== null && /^(utun|ipsec|ppp|tap|tun)/.test(iface);
}

/** What the OS reports as the resolver currently in use. */
export async function activeResolver(): Promise<string | null> {
  const result = await run("scutil", ["--dns"]);
  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("nameserver[0]")) {
      return trimmed.split(":").slice(1).join(":").trim();
    }
  }
  return null;
}
