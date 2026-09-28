/**
 * Forced safe search.
 *
 * Ported from the macOS prototype's `src/safesearch.ts`.
 *
 * Search engines publish alternate hostnames that serve the same site with
 * explicit results switched off. Answering a lookup with the safe host's address
 * instead of the real one turns safe search on for every client on the machine,
 * with no browser setting to flip and none to flip back.
 *
 * This is a third kind of answer, alongside "block" and "allow": the site still
 * works and still presents a valid certificate -- it is the same company's
 * servers -- it just refuses to return explicit results.
 *
 * Lookup here is EXACT, not label-wise, and that is not an oversight: a parent
 * match would redirect `mail.google.com` to the search sandbox and break Gmail.
 * It is exactly why the mapping file enumerates every host it wants covered.
 */

import { normalize } from './matching';

/**
 * The mapping shipped with the prototype (`safesearch.txt`), seeded here as the
 * default so a fresh install enforces safe search without an operator step.
 *
 * There is no table for this in the frozen schema, so it is a constant rather
 * than a row. See the report: a `SafeSearchMapping` model is the eventual home,
 * at which point this becomes the seed for it.
 */
export const DEFAULT_SAFESEARCH_TEXT = `
# Each line maps a search hostname to the alternate host that serves the same
# site with explicit results disabled.
#
#   <hostname>                  <safe-search host>

# --- Google ---
google.com                      forcesafesearch.google.com
www.google.com                  forcesafesearch.google.com
images.google.com               forcesafesearch.google.com

# --- YouTube ---
# restrictmoderate.youtube.com is Moderate; restrict.youtube.com is Strict.
# Strict blocks a great deal of harmless content -- start with moderate.
youtube.com                     restrictmoderate.youtube.com
www.youtube.com                 restrictmoderate.youtube.com
m.youtube.com                   restrictmoderate.youtube.com
youtubei.googleapis.com         restrictmoderate.youtube.com
youtube.googleapis.com          restrictmoderate.youtube.com

# --- Bing ---
bing.com                        strict.bing.com
www.bing.com                    strict.bing.com

# --- DuckDuckGo ---
duckduckgo.com                  safe.duckduckgo.com
www.duckduckgo.com              safe.duckduckgo.com
`;

export function parseMappings(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const withoutComment = (line.split('#', 1)[0] ?? '').trim();
    if (withoutComment === '') continue;
    const parts = withoutComment.split(/\s+/);
    if (parts.length < 2) continue;
    const source = normalize(parts[0]);
    const target = normalize(parts[1]);
    // A mapping to itself would loop the resolver back through this table.
    if (source !== '' && target !== '' && source !== target) map.set(source, target);
  }
  return map;
}

/** The default table, parsed once. */
export const SAFESEARCH_MAP: ReadonlyMap<string, string> = parseMappings(DEFAULT_SAFESEARCH_TEXT);

/** The safe-search host for this name, or null to treat it normally. */
export function target(name: string, map: ReadonlyMap<string, string> = SAFESEARCH_MAP): string | null {
  return map.get(normalize(name)) ?? null;
}

/** Every host we redirect to, so they are never redirected themselves. */
export function targets(map: ReadonlyMap<string, string> = SAFESEARCH_MAP): Set<string> {
  return new Set(map.values());
}

export interface SafeSearchEntry {
  host: string;
  safeHost: string;
}

/** The table as a wire-friendly array, sorted so responses are stable. */
export function safeSearchEntries(
  map: ReadonlyMap<string, string> = SAFESEARCH_MAP,
): SafeSearchEntry[] {
  return [...map.entries()]
    .map(([host, safeHost]) => ({ host, safeHost }))
    .sort((a, b) => a.host.localeCompare(b.host));
}
