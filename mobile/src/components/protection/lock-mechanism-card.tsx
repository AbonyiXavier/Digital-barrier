import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

export type LockMechanismCardProps = {
  icon: IconName;
  title: string;
  /** "Used at level 2" — which lock strength this mechanism belongs to. */
  appliesTo: string;
  /** True when this is the mechanism the current level actually uses. */
  active: boolean;
  children: ReactNode;
};

/**
 * One of the three mechanisms a Protection Lock can use. The inactive ones stay
 * editable — someone should be able to set a PIN up before they need it.
 */
export function LockMechanismCard({
  icon,
  title,
  appliesTo,
  active,
  children,
}: LockMechanismCardProps) {
  const theme = useTheme();

  return (
    <Card padding="lg" style={{ opacity: active ? 1 : 0.64 }}>
      <View style={[styles.head, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.chip,
            {
              backgroundColor: active ? theme.colors.shieldSoft : theme.colors.surfaceAlt,
              borderRadius: theme.radius.md,
            },
          ]}>
          <Icon
            name={icon}
            size={19}
            color={active ? theme.colors.shield : theme.colors.textSecondary}
          />
        </View>

        <View style={styles.text}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            {appliesTo}
          </Text>
        </View>

        {active ? <Badge label="In use" tone="shield" icon="checkmark" /> : null}
      </View>

      <View style={{ marginTop: theme.spacing.base, gap: theme.spacing.md }}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
});
