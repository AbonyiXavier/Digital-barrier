import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type CardProps = ViewProps & {
  children: ReactNode;
  /** `plain` sits on the background, `raised` gets a shadow, `outlined` a border. */
  variant?: 'plain' | 'raised' | 'outlined';
  padding?: 'none' | 'sm' | 'base' | 'lg';
  /** Fill with a two-stop gradient instead of a flat surface. */
  gradient?: readonly [string, string];
  onPress?: () => void;
};

const paddingFor = { none: 0, sm: 12, base: 16, lg: 20 } as const;

export function Card({
  children,
  variant = 'plain',
  padding = 'base',
  gradient,
  onPress,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    borderRadius: theme.radius.lg,
    padding: paddingFor[padding],
    backgroundColor: gradient ? 'transparent' : theme.colors.surface,
    borderWidth: variant === 'outlined' ? StyleSheet.hairlineWidth * 2 : 0,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  };

  const content = gradient ? (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  ) : null;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          base,
          variant === 'raised' ? theme.shadows.md : null,
          pressed ? { opacity: 0.85, transform: [{ scale: 0.995 }] } : null,
          style as ViewStyle,
        ]}>
        {content}
        {children}
      </Pressable>
    );
  }

  return (
    <View {...rest} style={[base, variant === 'raised' ? theme.shadows.md : null, style]}>
      {content}
      {children}
    </View>
  );
}
