import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.root, { paddingVertical: theme.spacing['3xl'], gap: theme.spacing.md }]}>
      <View
        style={[
          styles.icon,
          { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.xl },
        ]}>
        <Icon name={icon} size={28} color={theme.colors.textMuted} />
      </View>
      <Text variant="h3" align="center">
        {title}
      </Text>
      <Text variant="sub" tone="secondary" align="center" style={styles.description}>
        {description}
      </Text>
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant="secondary"
          size="sm"
          fullWidth={false}
          style={{ marginTop: theme.spacing.sm }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  icon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  description: { maxWidth: 280 },
});
