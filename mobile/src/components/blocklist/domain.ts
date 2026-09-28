export type DomainResult =
  | { ok: true; domain: string }
  | { ok: false; error: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;
const ALLOWED = /^[a-z0-9.-]+$/;

/**
 * Light validation only. This is a hosts-style rule, not a URL: a bare domain,
 * lower-cased, with any "www." prefix dropped so the rule covers both forms.
 */
export function normaliseDomain(raw: string): DomainResult {
  const value = raw.trim().toLowerCase();

  if (!value) return { ok: false, error: 'Enter a domain first.' };
  if (/\s/.test(value)) return { ok: false, error: 'A domain cannot contain spaces.' };
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
