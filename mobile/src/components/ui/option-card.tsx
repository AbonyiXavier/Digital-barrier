import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type OptionCardProps = {
  title: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** Renders a lock badge and dims the card — premium-gated options. */
  locked?: boolean;
  /** `radio` shows a dot, `check` a tick, `none` relies on the border alone. */
  indicator?: 'radio' | 'check' | 'none';
  /** Extra content under the description — a strength meter, a price, a chip. */
  children?: ReactNode;
};

/**
 * The selectable card used for protection levels, protection categories,
 * plans and blocked-screen themes. One component keeps all four consistent.
 */
export function OptionCard({
  title,
  description,
  icon,
  selected,
  onPress,
  locked = false,
  indicator = 'radio',
  children,
}: OptionCardProps) {
  const theme = useTheme();
  const accent = theme.colors.brand;

  return (
    <Pressable
      accessibilityRole={indicator === 'check' ? 'checkbox' : 'radio'}
      accessibilityState={{ selected, disabled: locked }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: selected ? theme.colors.brandSoft : theme.colors.surface,
          borderColor: selected ? accent : theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.base,
          gap: theme.spacing.md,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      {icon ? (
        <View
          style={[
            styles.icon,
            {
              backgroundColor: selected ? accent : theme.colors.surfaceAlt,
              borderRadius: theme.radius.md,
            },
          ]}>
          <Icon
            name={icon}
            size={20}
            color={selected ? theme.colors.textOnAccent : theme.colors.textSecondary}
          />
        </View>
      ) : null}

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="bodyStrong" style={styles.title}>
            {title}
          </Text>
          {locked ? <Icon name="lock-closed" size={14} color={theme.colors.textMuted} /> : null}
        </View>

        {description ? (
          <Text variant="sub" tone="secondary" style={{ marginTop: 3 }}>
            {description}
          </Text>
        ) : null}

        {children ? <View style={{ marginTop: theme.spacing.md }}>{children}</View> : null}
      </View>

      {indicator !== 'none' ? (
        <View
          style={[
            styles.indicator,
            {
              borderRadius: indicator === 'radio' ? 11 : 6,
              borderColor: selected ? accent : theme.colors.borderStrong,
              backgroundColor: selected ? accent : 'transparent',
            },
          ]}>
          {selected ? (
            indicator === 'check' ? (
              <Icon name="checkmark" size={13} color={theme.colors.textOnAccent} />
            ) : (
              <View style={[styles.dot, { backgroundColor: theme.colors.textOnAccent }]} />
            )
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1.5 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flexShrink: 1 },
  indicator: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
