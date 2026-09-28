import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ThemeColors } from './colors';
import { shadows } from './shadows';
import {
  duration,
  fontFamily,
  fontSize,
  fontWeight,
  layout,
  lineHeight,
  radius,
  spacing,
  tracking,
} from './tokens';

export type ColorSchemeName = 'light' | 'dark';

export type Theme = {
  scheme: ColorSchemeName;
  isDark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  lineHeight: typeof lineHeight;
  fontWeight: typeof fontWeight;
  fontFamily: typeof fontFamily;
  tracking: typeof tracking;
  duration: typeof duration;
  layout: typeof layout;
  shadows: typeof shadows;
};

function buildTheme(scheme: ColorSchemeName): Theme {
  return {
    scheme,
    isDark: scheme === 'dark',
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    fontSize,
    lineHeight,
    fontWeight,
    fontFamily,
    tracking,
    duration,
    layout,
    shadows,
  };
}

export const themes = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
} as const;

const ThemeContext = createContext<Theme>(themes.dark);

export function ThemeProvider({
  children,
  scheme,
}: {
  children: ReactNode;
  /** Force a scheme; omit to follow the OS. */
  scheme?: ColorSchemeName;
}) {
  const system = useColorScheme();
  const resolved: ColorSchemeName = scheme ?? (system === 'light' ? 'light' : 'dark');
  const value = useMemo(() => themes[resolved], [resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export type { ThemeColors };
export * from './tokens';
export { palette } from './palette';
export { shadows } from './shadows';
