import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
};

/** Two-to-three way switch: billing period, blocked-screen theme, list filters. */
export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.full, padding: 4 },
      ]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              styles.item,
              {
                borderRadius: theme.radius.full,
                backgroundColor: active ? theme.colors.surface : 'transparent',
              },
              active ? theme.shadows.sm : null,
            ]}>
            <Text variant="caption" tone={active ? 'default' : 'secondary'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9 },
});
