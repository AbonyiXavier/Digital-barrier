import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Divider, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type FaqItem = { question: string; answer: string };

export type FaqAccordionProps = {
  items: readonly FaqItem[];
};

/** One row open at a time — a pricing page should never become a wall of text. */
export function FaqAccordion({ items }: FaqAccordionProps) {
  const theme = useTheme();
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  return (
    <Card padding="none">
      {items.map((item, index) => {
        const open = item.question === openQuestion;
        return (
          <View key={item.question}>
            {index > 0 ? <Divider inset={theme.spacing.base} /> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => setOpenQuestion(open ? null : item.question)}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
              <View
                style={[
                  styles.head,
                  { padding: theme.spacing.base, gap: theme.spacing.md },
                ]}>
                <Text variant="bodyStrong" style={styles.question}>
                  {item.question}
                </Text>
                <Icon
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={theme.colors.textMuted}
                />
              </View>
            </Pressable>

            {open ? (
              <View
                style={{
                  paddingHorizontal: theme.spacing.base,
                  paddingBottom: theme.spacing.base,
                }}>
                <Text variant="sub" tone="secondary">
                  {item.answer}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  question: { flex: 1 },
});
