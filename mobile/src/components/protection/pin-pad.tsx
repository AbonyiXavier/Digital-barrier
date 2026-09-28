import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type PinPadProps = {
  value: string;
  onChange: (next: string) => void;
  /** How many digits the PIN has. */
  length?: number;
  /** Turns the dots coral and shakes the row once. */
  error?: boolean;
  disabled?: boolean;
};

const ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'delete'],
];

/**
 * A deliberate design moment: entering a PIN here should feel like unlocking
 * something, not filling in a form. Hence a real keypad rather than a field.
 */
export function PinPad({ value, onChange, length = 4, error = false, disabled = false }: PinPadProps) {
  const theme = useTheme();
  // Held in state rather than a ref so the value is never read during render.
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!error) return;

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [error, shake]);

  const press = (key: string) => {
    if (disabled || key === '') return;

    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }

    if (key === 'delete') {
      onChange(value.slice(0, -1));
      return;
    }
    if (value.length >= length) return;
    onChange(value + key);
  };

  const dotColor = error ? theme.colors.danger : theme.colors.brand;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Animated.View
        style={[
          styles.dots,
          {
            gap: theme.spacing.base,
            transform: [
              { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-12, 12] }) },
            ],
          },
        ]}>
        {Array.from({ length }, (_, index) => {
          const filled = index < value.length;
          return (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: filled ? dotColor : 'transparent',
                  borderColor: filled ? dotColor : theme.colors.borderStrong,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      <View style={{ gap: theme.spacing.md, opacity: disabled ? 0.5 : 1 }}>
        {ROWS.map((row) => (
          <View key={row.join('')} style={[styles.row, { gap: theme.spacing.md }]}>
            {row.map((key) =>
              key === '' ? (
                <View key="spacer" style={styles.key} />
              ) : (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key === 'delete' ? 'Delete' : key}
                  disabled={disabled}
                  onPress={() => press(key)}
                  style={({ pressed }) => [
                    styles.key,
                    {
                      borderRadius: theme.radius.full,
                      backgroundColor:
                        key === 'delete'
                          ? 'transparent'
                          : pressed
                            ? theme.colors.surfacePressed
                            : theme.colors.surfaceAlt,
                    },
                  ]}>
                  {key === 'delete' ? (
                    <Icon name="backspace-outline" size={22} color={theme.colors.textSecondary} />
                  ) : (
                    <Text variant="h2" rounded>
                      {key}
                    </Text>
                  )}
                </Pressable>
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  row: { flexDirection: 'row' },
  key: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center' },
});
