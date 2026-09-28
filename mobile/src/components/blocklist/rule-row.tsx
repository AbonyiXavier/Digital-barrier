import { Pressable, StyleSheet } from 'react-native';

import { Icon, ListRow } from '@/components/ui';
import { useTheme } from '@/theme';

export type RuleRowProps = {
  domain: string;
  /** Which list the rule lives in — decides the icon and its tint. */
  list: 'allowed' | 'blocked';
  onRemove: () => void;
  divider?: boolean;
};

export function RuleRow({ domain, list, onRemove, divider = false }: RuleRowProps) {
  const theme = useTheme();
  const allowed = list === 'allowed';

  return (
    <ListRow
      title={domain}
      subtitle={allowed ? 'Always reachable' : 'Always blocked'}
      icon={allowed ? 'checkmark-circle-outline' : 'ban-outline'}
      iconColor={allowed ? theme.colors.shield : theme.colors.danger}
      divider={divider}
      chevron={false}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${domain}`}
          hitSlop={10}
          onPress={onRemove}
          style={({ pressed }) => [
            styles.remove,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderRadius: theme.radius.full,
              opacity: pressed ? 0.6 : 1,
            },
          ]}>
          <Icon name="close" size={16} color={theme.colors.textSecondary} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  remove: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
