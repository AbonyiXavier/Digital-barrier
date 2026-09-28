/**
 * Domain validation for a user-entered rule.
 *
 * Ported from `mobile/src/components/blocklist/domain.ts` so the server applies
 * the same rule the input field does. Client-side validation is a courtesy; this
 * is the one that counts, and having them disagree is how a domain the UI
 * refused arrives through a replayed request.
 *
 * `normalize()` from the matcher runs first (it strips a trailing dot and a
 * leading `*.`, which the mobile check does not know about), then these checks.
 */

import { normalize } from './matching';

export type DomainResult = { ok: true; domain: string } | { ok: false; error: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;
const ALLOWED = /^[a-z0-9.-]+$/;

/** Light validation only: this is a hosts-style rule, not a URL. */
export function normaliseDomain(raw: string): DomainResult {
  // Any whitespace has to be caught before trimming folds the outer kind away.
  if (/\s/.test(raw.trim())) return { ok: false, error: 'A domain cannot contain spaces.' };

  const value = normalize(raw);

  if (value === '') return { ok: false, error: 'Enter a domain first.' };
  if (SCHEME.test(value) || value.includes('/')) {
    return { ok: false, error: 'Just the domain, without https:// or a path.' };
  }

  const bare = value.startsWith('www.') ? value.slice(4) : value;

  if (!bare.includes('.')) return { ok: false, error: 'That needs a dot, like example.com.' };
  if (!ALLOWED.test(bare)) return { ok: false, error: 'Letters, numbers, dots and hyphens only.' };
  if (bare.startsWith('.') || bare.endsWith('.') || bare.includes('..')) {
    return { ok: false, error: 'That does not look like a domain.' };
  }

  return { ok: true, domain: bare };
}
