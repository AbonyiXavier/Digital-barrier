/**
 * Domain matching for the filter.
 *
 * Ported from the macOS prototype's `src/blocklist.ts`. The semantics are
 * unchanged and deliberately so: they are the part of the prototype that was
 * tested, and re-deriving them here would be how a subtle matching bug gets
 * introduced.
 *
 * A rule matches the domain itself and every subdomain of it, and nothing else:
 * `pornhub.com` blocks `pornhub.com` and `www.pornhub.com` but never
 * `notpornhub.com`. Matching walks labels, never substrings -- substring
 * matching is the classic way a naive blocker starts eating unrelated sites.
 *
 * Two changes from the prototype:
 *  - the ruleset is passed in rather than read from the filesystem, because here
 *    it comes from Postgres (user rules) and a gzipped artifact (feeds);
 *  - `lookup` is exported. In the prototype it was private and then
 *    hand-duplicated as `blocks()` in feeds.ts, which is two copies of the one
 *    rule that decides what the whole product does. One copy, exported.
 */

export type DecisionSource = 'allowlist' | 'blocklist' | 'default';

export interface Decision {
  allowed: boolean;
  /** The rule that decided this, if any. */
  rule: string | null;
  source: DecisionSource;
}

/** An allowlist and a blocklist. The allowlist wins; see `decide`. */
export interface RuleSets {
  allowed: Set<string>;
  blocked: Set<string>;
}

export function normalize(name: string): string {
  let value = name.trim().toLowerCase();
  while (value.endsWith('.')) value = value.slice(0, -1);
  if (value.startsWith('*.')) value = value.slice(2);
  return value;
}

const HOSTS_FILE_PREFIXES = new Set(['0.0.0.0', '127.0.0.1', '::', '::1']);

export function parseRules(text: string): Set<string> {
  const rules = new Set<string>();
  for (const line of text.split('\n')) {
    const withoutComment = line.split('#')[0] ?? '';
    for (const token of withoutComment.split(/\s+/)) {
      // Tolerate hosts-file style lines ("0.0.0.0 example.com").
      if (token === '' || HOSTS_FILE_PREFIXES.has(token)) continue;
      const name = normalize(token);
      if (name !== '') rules.add(name);
    }
  }
  return rules;
}

/**
 * Return the matching rule for `name` or any of its parents, else null.
 *
 * Exported on purpose: the feed sentinel check needs exactly this and must not
 * own a second implementation of it.
 */
export function lookup(rules: Set<string>, name: string): string | null {
  const labels = name.split('.');
  for (let i = 0; i < labels.length; i += 1) {
    const candidate = labels.slice(i).join('.');
    if (rules.has(candidate)) return candidate;
  }
  return null;
}

/** Does `rules` match `name` or any parent of it? */
export function matches(rules: Set<string>, name: string): boolean {
  return lookup(rules, name) !== null;
}

/**
 * The allowlist wins unconditionally.
 *
 * Note what is *not* here: no comparison of how specific the two matching rules
 * are. "The more specific rule wins" sounds fairer and is a trap -- it means a
 * user cannot reliably unblock anything, because the next feed refresh may ship a
 * longer rule than theirs. An allowlist entry is the user overriding us, and an
 * override that can be outvoted is not an override.
 */
export function decide(rules: RuleSets, name: string): Decision {
  const normalized = normalize(name);
  const allowRule = lookup(rules.allowed, normalized);
  if (allowRule !== null) {
    return { allowed: true, rule: allowRule, source: 'allowlist' };
  }
  const blockRule = lookup(rules.blocked, normalized);
  if (blockRule !== null) {
    return { allowed: false, rule: blockRule, source: 'blocklist' };
  }
  return { allowed: true, rule: null, source: 'default' };
}
