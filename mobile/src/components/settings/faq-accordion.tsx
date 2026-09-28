import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';


export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  /** Sends the reader to the screen that actually fixes the thing. */
  action?: { label: string; path: Href };
};

export type FaqAccordionProps = {
  entries: FaqEntry[];
};

export function FaqAccordion({ entries }: FaqAccordionProps) {
  const theme = useTheme();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card padding="none">
      {entries.map((entry, index) => {
        const open = openId === entry.id;

        return (
          <View
            key={entry.id}
            style={{
              paddingHorizontal: theme.spacing.base,
              borderBottomWidth: index < entries.length - 1 ? StyleSheet.hairlineWidth : 0,
              borderBottomColor: theme.colors.border,
            }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
                setOpenId(open ? null : entry.id);
              }}
              style={({ pressed }) => [
                styles.head,
                { paddingVertical: theme.spacing.base, gap: theme.spacing.md },
                pressed ? { opacity: 0.6 } : null,
              ]}>
              <Text variant="bodyStrong" style={styles.question}>
                {entry.question}
              </Text>
              <Icon
                name={open ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={open ? theme.colors.brand : theme.colors.textMuted}
              />
            </Pressable>

            {open ? (
              <View style={{ paddingBottom: theme.spacing.base, gap: theme.spacing.md }}>
                <Text variant="sub" tone="secondary">
                  {entry.answer}
                </Text>
                {entry.action ? (
                  <Button
                    label={entry.action.label}
                    variant="secondary"
                    size="sm"
                    icon="arrow-forward"
                    iconTrailing
                    fullWidth={false}
                    onPress={() => entry.action && router.push(entry.action.path)}
                  />
                ) : null}
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
