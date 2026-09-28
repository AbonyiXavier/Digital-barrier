import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconProps = {
  name: IconName;
  size?: number;
  /** Any theme colour value, or a raw colour string. Defaults to body text. */
  color?: string;
};

/**
 * Single icon set across the whole app. Screens import this rather than
 * Ionicons directly, so swapping the set later is one file.
 */
export function Icon({ name, size = 20, color }: IconProps) {
  const theme = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.colors.text} />;
}
