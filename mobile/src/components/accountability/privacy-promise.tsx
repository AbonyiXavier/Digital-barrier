import { StyleSheet, View } from 'react-native';

import { Card, Icon, Text, type IconName } from '@/components/ui';
import { APP_NAME } from '@/lib/app';
import { useTheme } from '@/theme';

const CAN_SEE: readonly string[] = [
  'Requests to turn protection off',
  'The reason you wrote',
  'When protection turns on or off',
];

const NEVER_SEES: readonly string[] = [
  'The sites you visit',
  'Your search history',
  'Anything you read or watch',
];

type ColumnProps = {
  label: string;
  icon: IconName;
  bullet: IconName;
  accent: string;
  items: readonly string[];
};

function Column({ label, icon, bullet, accent, items }: ColumnProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.column,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          gap: theme.spacing.md,
        },
      ]}>
      <View style={styles.head}>
        <Icon name={icon} size={14} color={accent} />
        <Text variant="label" style={{ color: accent }}>
          {label}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {items.map((item) => (
          <View key={item} style={styles.item}>
            <Icon name={bullet} size={13} color={accent} />
            <Text variant="caption" tone="secondary" style={styles.flex}>
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The trust moment of the app. Two columns, one line between them, and no
 * setting anywhere that can move it.
 */
export function PrivacyPromise() {
  const theme = useTheme();

  return (
    <Card variant="outlined" padding="lg">
      <View style={[styles.header, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.badge,
            { backgroundColor: theme.colors.shieldSoft, borderRadius: theme.radius.md },
          ]}>
          <Icon name="lock-closed" size={18} color={theme.colors.shield} />
        </View>

        <View style={styles.flex}>
          <Text variant="h3">What your partner can see</Text>
          <Text variant="sub" tone="secondary" style={{ marginTop: 3 }}>
            The line between these two columns never moves.
          </Text>
        </View>
      </View>

      <View style={[styles.columns, { gap: theme.spacing.md, marginTop: theme.spacing.base }]}>
        <Column
          label="Can see"
          icon="eye-outline"
          bullet="checkmark"
          accent={theme.colors.shield}
          items={CAN_SEE}
        />
        <Column
          label="Never sees"
          icon="eye-off-outline"
          bullet="remove"
          accent={theme.colors.textMuted}
          items={NEVER_SEES}
        />
      </View>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
        This is how {APP_NAME} is built, not a preference either of you can change.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  badge: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  columns: { flexDirection: 'row', alignItems: 'stretch' },
  column: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  flex: { flex: 1 },
});
