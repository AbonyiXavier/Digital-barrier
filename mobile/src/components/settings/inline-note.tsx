import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Icon, Text, type IconName, type TextTone } from '@/components/ui';
import { useTheme } from '@/theme';

export type InlineNoteProps = {
  text: string;
  tone?: Extract<TextTone, 'shield' | 'warn' | 'danger' | 'secondary' | 'muted'>;
  icon?: IconName;
};

/** A quiet line of feedback that replaces the alerts this app never shows. */
export function InlineNote({ text, tone = 'shield', icon = 'checkmark-circle' }: InlineNoteProps) {
  const theme = useTheme();

  const color =
    tone === 'shield'
      ? theme.colors.shield
      : tone === 'warn'
        ? theme.colors.warn
        : tone === 'danger'
          ? theme.colors.danger
          : theme.colors.textMuted;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.md,
      }}>
      <Icon name={icon} size={16} color={color} />
      <Text variant="sub" tone={tone} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** Shows a note, then clears it on its own — nothing to dismiss. */
export function useTransientNote(ms = 4000): [string | null, (text: string) => void] {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), ms);
    return () => clearTimeout(timer);
  }, [note, ms]);

  const show = useCallback((text: string) => setNote(text), []);

  return [note, show];
}
