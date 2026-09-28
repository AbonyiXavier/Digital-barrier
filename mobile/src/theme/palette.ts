/**
 * Raw colour values. Nothing outside `src/theme` should import this file —
 * screens consume semantic names via `useTheme()` so a re-skin touches one place.
 */

export const palette = {
  // Brand — electric indigo. Used for primary actions and focus.
  indigo50: '#EEF0FF',
  indigo100: '#DDE1FF',
  indigo300: '#9AA5FF',
  indigo500: '#5B6CFF',
  indigo600: '#4453E8',
  indigo700: '#3341C4',

  // Violet — the second stop of the brand gradient.
  violet500: '#8B5CF6',
  violet600: '#7A44F0',

  // Shield — protection is active. Mint teal reads "safe" without shouting.
  mint50: '#E6FAF4',
  mint300: '#6FE0C0',
  mint500: '#22C79E',
  mint600: '#12A594',
  mint700: '#0B7F73',

  // Amber — waiting periods, pending approvals, "needs attention".
  amber50: '#FFF6E5',
  amber300: '#FFD27A',
  amber500: '#FFB020',
  amber600: '#E08A00',

  // Coral — protection off, destructive actions.
  coral50: '#FFECEC',
  coral300: '#FF9B9E',
  coral500: '#FF5A5F',
  coral600: '#E23F46',

  // Neutral ink scale, tuned cool to sit with the indigo brand.
  ink900: '#080B14',
  ink850: '#0B0F1A',
  ink800: '#111725',
  ink750: '#161D2E',
  ink700: '#1C2436',
  ink600: '#2A3346',
  ink500: '#3C4760',
  ink400: '#5A6782',
  ink300: '#8593AD',
  ink200: '#AEB9CC',
  ink100: '#D6DDE9',
  ink50: '#EDF1F7',

  white: '#FFFFFF',
  offWhite: '#F6F7FB',
  black: '#000000',
} as const;
