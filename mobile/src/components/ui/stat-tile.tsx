import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type StatTileProps = {
  /** The figure itself — already formatted ("19", "2 days", "74k"). */
  value: string;
  label: string;
  icon?: IconName;
  tone?: 'default' | 'shield' | 'warn' | 'danger' | 'brand';
};

/** Compact metric block. Three of these sit in a row on the dashboard. */
export function StatTile({ value, label, icon, tone = 'default' }: StatTileProps) {
  const theme = useTheme();
  const tint =
    tone === 'shield'
      ? theme.colors.shield
      : tone === 'warn'
        ? theme.colors.warn
        : tone === 'danger'
          ? theme.colors.danger
          : tone === 'brand'
            ? theme.colors.brand
            : theme.colors.textSecondary;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: 6,
      }}>
      {icon ? <Icon name={icon} size={16} color={tint} /> : null}
      <Text variant="h3" rounded numberOfLines={1}>
        {value}
      </Text>
      <Text variant="micro" tone="muted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}
