import { StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export type NeverRowProps = {
  title: string;
  subtitle: string;
  divider?: boolean;
};

/**
 * The counterpart to ListRow, for the "we never store this" list. Struck-through
 * and uncoloured on purpose: the contrast with the tinted rows above is the
 * whole point of the section.
 */
export function NeverRow({ title, subtitle, divider = false }: NeverRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.md,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: theme.colors.border,
        },
      ]}>
      <View
        style={[
          styles.chip,
          {
            borderRadius: theme.radius.md,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
          },
        ]}>
        <Icon name="close" size={17} color={theme.colors.textMuted} />
      </View>

      <View style={styles.text}>
        <Text
          variant="bodyStrong"
          tone="secondary"
          numberOfLines={1}
          style={styles.struck}>
          {title}
        </Text>
        <Text variant="sub" tone="muted" numberOfLines={2} style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
});
