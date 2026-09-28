import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

export type SectionProps = {
  title?: string;
  /** Sits under the title, explaining the group. */
  description?: string;
  /** Small text button on the right of the title row. */
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  /** Vertical space above the section. */
  gap?: number;
};

/** A titled group of rows or cards. The main rhythm device on long screens. */
export function Section({ title, description, action, children, gap }: SectionProps) {
  const theme = useTheme();

  return (
    <View style={{ marginTop: gap ?? theme.spacing.xl }}>
      {title || action ? (
        <View style={[styles.head, { marginBottom: theme.spacing.md }]}>
          <View style={styles.headText}>
            {title ? (
              <Text variant="label" tone="muted">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text variant="sub" tone="secondary" style={{ marginTop: 6 }}>
                {description}
              </Text>
            ) : null}
          </View>

          {action ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={action.onPress}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
              <Text variant="caption" tone="brand">
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headText: { flex: 1 },
});
