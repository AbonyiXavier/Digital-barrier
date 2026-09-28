/**
 * Domain matching for the filter.
 *
 * A rule matches the domain itself and every subdomain of it, and nothing else:
 * `pornhub.com` blocks `pornhub.com` and `www.pornhub.com` but never
 * `notpornhub.com`. Matching walks labels, never substrings -- substring
 * matching is the classic way a naive blocker starts eating unrelated sites.
 */

import { readFile } from "node:fs/promises";

export type DecisionSource = "allowlist" | "blocklist" | "default";

export interface Decision {
  allowed: boolean;
  /** The rule that decided this, if any. */
  rule: string | null;
  source: DecisionSource;
}

export function normalize(name: string): string {
  let value = name.trim().toLowerCase();
  while (value.endsWith(".")) value = value.slice(0, -1);
  if (value.startsWith("*.")) value = value.slice(2);
  return value;
}

const HOSTS_FILE_PREFIXES = new Set(["0.0.0.0", "127.0.0.1", "::", "::1"]);

export function parseRules(text: string): Set<string> {
  const rules = new Set<string>();
  for (const line of text.split("\n")) {
    const withoutComment = line.split("#")[0] ?? "";
    for (const token of withoutComment.split(/\s+/)) {
      // Tolerate hosts-file style lines ("0.0.0.0 example.com").
      if (token === "" || HOSTS_FILE_PREFIXES.has(token)) continue;
      const name = normalize(token);
      if (name !== "") rules.add(name);
    }
  }
  return rules;
}

async function readRules(path: string | undefined): Promise<Set<string>> {
  if (path === undefined) return new Set();
  try {
    return parseRules(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw error;
  }
}

/** Return the matching rule for `name` or any of its parents. */
function lookup(rules: Set<string>, name: string): string | null {
  const labels = name.split(".");
  for (let i = 0; i < labels.length; i += 1) {
    const candidate = labels.slice(i).join(".");
    if (rules.has(candidate)) return candidate;
  }
  return null;
}

/** A blocklist plus an allowlist that overrides it. */
export class Blocklist {
  private blocked = new Set<string>();
  private allowed = new Set<string>();

  private readonly blockPaths: string[];

  /** `blockPaths` may be a single file or several (blocklist.txt plus feeds). */
  constructor(
    blockPaths?: string | string[],
    private readonly allowPath?: string,
  ) {
    if (blockPaths === undefined) this.blockPaths = [];
    else this.blockPaths = Array.isArray(blockPaths) ? blockPaths : [blockPaths];
  }

  async load(): Promise<{ blocked: number; allowed: number }> {
    // Read everything before swapping, so a failed read never leaves half a ruleset.
    const [blockSets, allowed] = await Promise.all([
      Promise.all(this.blockPaths.map(readRules)),
      readRules(this.allowPath),
    ]);
    const blocked = new Set<string>();
    for (const set of blockSets) for (const rule of set) blocked.add(rule);
    this.blocked = blocked;
    this.allowed = allowed;
    return { blocked: blocked.size, allowed: allowed.size };
  }

  decide(name: string): Decision {
    const normalized = normalize(name);
    const allowRule = lookup(this.allowed, normalized);
    if (allowRule !== null) {
      return { allowed: true, rule: allowRule, source: "allowlist" };
    }
    const blockRule = lookup(this.blocked, normalized);
    if (blockRule !== null) {
      return { allowed: false, rule: blockRule, source: "blocklist" };
    }
    return { allowed: true, rule: null, source: "default" };
  }

  get counts(): { blocked: number; allowed: number } {
    return { blocked: this.blocked.size, allowed: this.allowed.size };
  }
}
