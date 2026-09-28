import { palette } from './palette';

/**
 * Semantic colour contract. Both schemes must define every key, so a screen can
 * never reference a colour that only exists in one mode.
 */
export type ThemeColors = {
  /** Page background, behind everything. */
  background: string;
  /** Slightly raised page background used by grouped lists. */
  backgroundAlt: string;
  /** Card / sheet surface. */
  surface: string;
  /** A surface sitting on top of another surface (rows inside a card). */
  surfaceAlt: string;
  /** Pressed / selected surface state. */
  surfacePressed: string;
  /** Hairline separators. */
  border: string;
  /** A stronger border, e.g. an outlined button. */
  borderStrong: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  /** Text that sits on a filled brand / status colour. */
  textOnAccent: string;

  brand: string;
  brandStrong: string;
  brandSoft: string;
  brandGradient: readonly [string, string];

  /** Protection is on and healthy. */
  shield: string;
  shieldStrong: string;
  shieldSoft: string;
  shieldGradient: readonly [string, string];

  /** Waiting period, pending approval, degraded. */
  warn: string;
  warnSoft: string;

  /** Protection off, destructive. */
  danger: string;
  dangerSoft: string;

  /** Tab bar and other chrome. */
  chrome: string;
  chromeBorder: string;

  /** Scrim behind modals. */
  scrim: string;
  /** Glow used behind the dashboard shield. */
  glow: string;
};

export const darkColors: ThemeColors = {
  background: palette.ink850,
  backgroundAlt: palette.ink900,
  surface: palette.ink800,
  surfaceAlt: palette.ink700,
  surfacePressed: palette.ink600,
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.16)',

  text: palette.white,
  textSecondary: palette.ink200,
  textMuted: palette.ink400,
  textOnAccent: palette.white,

  brand: palette.indigo500,
  brandStrong: palette.indigo300,
  brandSoft: 'rgba(91,108,255,0.16)',
  brandGradient: [palette.indigo500, palette.violet500],

  shield: palette.mint500,
  shieldStrong: palette.mint300,
  shieldSoft: 'rgba(34,199,158,0.15)',
  shieldGradient: [palette.mint500, palette.mint600],

  warn: palette.amber500,
  warnSoft: 'rgba(255,176,32,0.15)',

  danger: palette.coral500,
  dangerSoft: 'rgba(255,90,95,0.15)',

  chrome: 'rgba(17,23,37,0.92)',
  chromeBorder: 'rgba(255,255,255,0.08)',

  scrim: 'rgba(3,5,10,0.72)',
  glow: 'rgba(34,199,158,0.22)',
};

export const lightColors: ThemeColors = {
  background: palette.offWhite,
  backgroundAlt: palette.ink50,
  surface: palette.white,
  surfaceAlt: palette.ink50,
  surfacePressed: palette.ink100,
  border: 'rgba(11,15,26,0.08)',
  borderStrong: 'rgba(11,15,26,0.16)',

  text: palette.ink900,
  textSecondary: palette.ink500,
  textMuted: palette.ink400,
  textOnAccent: palette.white,

  brand: palette.indigo600,
  brandStrong: palette.indigo700,
  brandSoft: palette.indigo50,
  brandGradient: [palette.indigo500, palette.violet600],

  shield: palette.mint600,
  shieldStrong: palette.mint700,
  shieldSoft: palette.mint50,
  shieldGradient: [palette.mint500, palette.mint600],

  warn: palette.amber600,
  warnSoft: palette.amber50,

  danger: palette.coral600,
  dangerSoft: palette.coral50,

  chrome: 'rgba(255,255,255,0.94)',
  chromeBorder: 'rgba(11,15,26,0.08)',

  scrim: 'rgba(11,15,26,0.45)',
  glow: 'rgba(34,199,158,0.18)',
};
