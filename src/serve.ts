/**
 * Daemon entry point: `node dist/src/serve.js --port 53`.
 *
 * Runs in the foreground; `barrier on` launches it detached. Kept separate from
 * the CLI so tests can run a resolver on an unprivileged port without touching
 * system DNS.
 */

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { Blocklist } from "./blocklist.js";
import { Monitor, sense } from "./bypass.js";
import * as probe from "./probe.js";
import { DEFAULT_UPSTREAMS, Resolver, serve, type QueryEvent } from "./resolver.js";
import { SafeSearch } from "./safesearch.js";
import * as state from "./state.js";

/** Local wall-clock time -- an accountability log is read in the user's timezone. */
function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day}T${time}`;
}

/** Serialises log appends so concurrent queries cannot interleave a line. */
function createQueryLogger(path: string): (event: QueryEvent) => void {
  let queue: Promise<void> = Promise.resolve();
  return (event: QueryEvent) => {
    const stamp = timestamp();
    const suffix = event.rule !== null ? `  via ${event.rule}` : "";
    const line = `${stamp}  ${event.action.padEnd(8)} ${event.qtype.padEnd(5)} ${event.name}${suffix}\n`;
    queue = queue.then(() => appendFile(path, line, "utf8")).catch(() => {});
  };
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "53" },
      upstream: { type: "string", multiple: true },
      blocklist: { type: "string" },
      allowlist: { type: "string" },
      "query-log": { type: "string" },
      "monitor-interval": { type: "string", default: "15" },
      "no-monitor": { type: "boolean", default: false },
      safesearch: { type: "string" },
      "no-safesearch": { type: "boolean", default: false },
    },
  });

  const host = values.host ?? "127.0.0.1";
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    process.stderr.write(`error: invalid port ${String(values.port)}\n`);
    return 1;
  }

  const rules = new Blocklist(
    values.blocklist ?? state.blockSources(),
    values.allowlist ?? state.allowPath(),
  );
  const counts = await rules.load();

  const safeSearch = values["no-safesearch"] === true
    ? undefined
    : new SafeSearch(values.safesearch ?? state.safeSearchPath());
  const safeSearchCount = safeSearch !== undefined ? await safeSearch.load() : 0;

  const logPath = values["query-log"] ?? state.queryLog();
  const upstreams = values.upstream ?? [...DEFAULT_UPSTREAMS];
  const resolver = new Resolver(rules, upstreams, createQueryLogger(logPath), safeSearch);

  let handle;
  try {
    handle = await serve(resolver, host, port);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES") {
      process.stderr.write(`error: binding ${host}:${port} needs root -- run with sudo\n`);
    } else if (code === "EADDRINUSE") {
      process.stderr.write(`error: ${host}:${port} is already in use\n`);
    } else {
      process.stderr.write(`error: cannot bind ${host}:${port} (${String(error)})\n`);
    }
    return 1;
  }

  process.stdout.write(
    `listening on ${host}:${port} (udp+tcp) | ${counts.blocked} blocked, ` +
    `${counts.allowed} allowed rules | ${safeSearchCount} safe-search rules | ` +
    `upstream ${upstreams.join(", ")}\n`,
  );

  // Watch for a VPN or a DNS change routing around us. Runs here because the
  // resolver is already long-lived and already root.
  let monitor: Monitor | null = null;
  if (values["no-monitor"] !== true) {
    const seconds = Number(values["monitor-interval"]);
    const intervalMs = Number.isFinite(seconds) && seconds >= 1 ? seconds * 1000 : 15_000;
    monitor = new Monitor(
      async () => sense(await probe.healthy(host, port, 800)),
      intervalMs,
      {
        onEvent: (event) => process.stdout.write(
          `${event.at}  ${event.type} ${event.state} (${event.reason}): ${event.detail}\n`),
      },
    );
    monitor.start();
  }

  // SIGHUP reloads the rule files without dropping in-flight queries.
  process.on("SIGHUP", () => {
    void rules.load();
    void safeSearch?.load();
  });

  await new Promise<void>((done) => {
    const stop = (): void => done();
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  });

  monitor?.stop();
  await handle.close();
  process.stdout.write(`stopped | ${JSON.stringify(resolver.stats)}\n`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (error: unknown) => {
    process.stderr.write(`fatal: ${String(error)}\n`);
    process.exitCode = 1;
  },
);
