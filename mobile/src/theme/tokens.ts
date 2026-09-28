import { Platform } from 'react-native';

/** 4pt base scale. Use the named steps, not raw numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 36,
  full: 999,
} as const;

/**
 * iOS gets the rounded system face for display numerals — it makes big figures
 * feel friendlier, which matters for an app people open in a hard moment.
 */
export const fontFamily = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  web: { sans: 'var(--font-display)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
})!;

export const fontSize = {
  micro: 11,
  caption: 12,
  sub: 14,
  body: 16,
  h3: 18,
  h2: 22,
  h1: 28,
  display: 34,
  hero: 44,
} as const;

export const lineHeight = {
  micro: 15,
  caption: 17,
  sub: 20,
  body: 24,
  h3: 25,
  h2: 29,
  h1: 34,
  display: 40,
  hero: 50,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Letter-spacing: tighten as type grows, open up for small all-caps labels. */
export const tracking = {
  tight: -0.6,
  snug: -0.3,
  normal: 0,
  wide: 0.4,
  caps: 1.1,
} as const;

export const duration = {
  fast: 140,
  base: 240,
  slow: 420,
} as const;

/** Layout guard rails so the phone design doesn't stretch badly on a tablet. */
export const layout = {
  maxContentWidth: 560,
  screenPadding: spacing.lg,
  tabBarHeight: 64,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
export type FontSize = keyof typeof fontSize;
