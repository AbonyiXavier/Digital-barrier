import { ProtectionCategory } from '../../generated/prisma/client';

/**
 * The fixed four-row category reference table.
 *
 * The app ships these ids in kebab-case and the database stores an enum, so the
 * mapping lives here rather than being reconstructed by string mangling at each
 * call site. Note `adult-search`, whose title ("Safe search") deliberately does
 * not match its id -- the id names what is filtered, the title names what the
 * user turns on.
 *
 * Copy is verbatim from the app. Changing it here changes it in the product.
 */

export interface CategoryRef {
  id: string;
  key: ProtectionCategory;
  title: string;
  description: string;
  premium: boolean;
}

export const CATEGORY_REFS: readonly CategoryRef[] = [
  {
    id: 'adult-websites',
    key: ProtectionCategory.ADULT_WEBSITES,
    title: 'Adult websites',
    description: 'Blocks adult sites at the DNS level, in every browser on the device.',
    premium: false,
  },
  {
    id: 'adult-apps',
    key: ProtectionCategory.ADULT_APPS,
    title: 'Adult apps',
    description: 'Stops known adult apps from loading their content or signing in.',
    premium: false,
  },
  {
    id: 'adult-search',
    key: ProtectionCategory.ADULT_SEARCH,
    title: 'Safe search',
    description: 'Forces safe search on Google, Bing, DuckDuckGo and YouTube.',
    premium: true,
  },
  {
    id: 'gambling',
    key: ProtectionCategory.GAMBLING,
    title: 'Gambling',
    description: 'Blocks betting and casino sites. Useful alongside adult content.',
    premium: true,
  },
];

export const CATEGORY_IDS: readonly string[] = CATEGORY_REFS.map((c) => c.id);

export function categoryById(id: string): CategoryRef | undefined {
  return CATEGORY_REFS.find((c) => c.id === id);
}

export function categoryIdFor(key: ProtectionCategory): string {
  const found = CATEGORY_REFS.find((c) => c.key === key);
  // Unreachable while the enum and this table agree, which a test asserts.
  return found?.id ?? key.toLowerCase().replace(/_/g, '-');
}
