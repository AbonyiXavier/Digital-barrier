import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type BadgeTone = 'neutral' | 'brand' | 'shield' | 'warn' | 'danger';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  /** Filled badges sit on plain surfaces; soft ones sit inside coloured cards. */
  variant?: 'soft' | 'solid';
  /** A small pulsing dot — used for "live" states like Protection ON. */
  dot?: boolean;
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
  variant = 'soft',
  dot = false,
}: BadgeProps) {
  const theme = useTheme();
  const { colors } = theme;

  const map = {
    neutral: { fg: colors.textSecondary, bg: colors.surfaceAlt },
    brand: { fg: colors.brand, bg: colors.brandSoft },
    shield: { fg: colors.shield, bg: colors.shieldSoft },
    warn: { fg: colors.warn, bg: colors.warnSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
  } as const;

  const { fg, bg } = map[tone];
  const solid = variant === 'solid';
  const foreground = solid ? colors.textOnAccent : fg;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: solid ? fg : bg,
          borderRadius: theme.radius.full,
          gap: theme.spacing.xs,
        },
      ]}>
      {dot ? <View style={[styles.dot, { backgroundColor: foreground }]} /> : null}
      {icon ? <Icon name={icon} size={12} color={foreground} /> : null}
      <Text variant="caption" style={{ color: foreground }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
