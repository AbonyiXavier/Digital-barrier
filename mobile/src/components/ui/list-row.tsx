import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Tint for the icon chip. Defaults to brand. */
  iconColor?: string;
  /** Replaces the icon chip entirely (avatars, flags, custom art). */
  leading?: ReactNode;
  /** Right-hand slot: a switch, a value, a badge. */
  trailing?: ReactNode;
  /** Trailing chevron. Defaults to true when `onPress` is set. */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Hairline under the row — set false on the last row of a group. */
  divider?: boolean;
};

/** The workhorse row for settings, device lists, partner lists and menus. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor,
  leading,
  trailing,
  chevron,
  onPress,
  disabled = false,
  divider = false,
}: ListRowProps) {
  const theme = useTheme();
  const showChevron = chevron ?? Boolean(onPress);
  const tint = iconColor ?? theme.colors.brand;

  const body = (
    <View
      style={[
        styles.row,
        {
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          opacity: disabled ? 0.45 : 1,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.border,
        },
      ]}>
      {leading ??
        (icon ? (
          <View
            style={[
              styles.chip,
              { backgroundColor: `${tint}22`, borderRadius: theme.radius.md },
            ]}>
            <Icon name={icon} size={19} color={tint} />
          </View>
        ) : null)}

      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="sub" tone="secondary" numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}
      {showChevron ? (
        <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
      ) : null}
    </View>
  );

  if (!onPress || disabled) return body;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
