import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote, ListGroup, useTransientNote } from '@/components/settings';
import {
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  Toggle,
  type IconName,
} from '@/components/ui';
import { useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { NotificationSettings } from '@/types';

type Row = {
  key: keyof NotificationSettings;
  title: string;
  subtitle: string;
  icon: IconName;
};

const PROTECTION_ROWS: Row[] = [
  {
    key: 'blockedAttempts',
    title: 'Blocked attempts',
    subtitle: 'When something is blocked on your devices',
    icon: 'shield-half-outline',
  },
  {
    key: 'partnerActivity',
    title: 'Partner activity',
    subtitle: 'When your partner responds to a request',
    icon: 'people-outline',
  },
];

const UPDATE_ROWS: Row[] = [
  {
    key: 'weeklyReport',
    title: 'Weekly report',
    subtitle: 'A short summary every Sunday',
    icon: 'stats-chart-outline',
  },
  {
    key: 'productUpdates',
    title: 'Product updates',
    subtitle: 'Occasional news about new features',
    icon: 'sparkles-outline',
  },
];

export default function NotificationsScreen() {
  const theme = useTheme();
  const { notifications } = useAppState();
  const dispatch = useAppDispatch();

  // The OS owns this switch; the prototype mirrors it so the denied state can
  // be seen without leaving the app.
  const [osAllowed, setOsAllowed] = useState(true);
  const [note, showNote] = useTransientNote();

  const renderRow = (row: Row) => (
    <ListRow
      key={row.key}
      title={row.title}
      subtitle={row.subtitle}
      icon={row.icon}
      iconColor={osAllowed ? theme.colors.brand : theme.colors.textMuted}
      chevron={false}
      disabled={!osAllowed}
      trailing={
        <Toggle
          value={notifications[row.key]}
          disabled={!osAllowed}
          tone="brand"
          accessibilityLabel={row.title}
          onValueChange={(value) =>
            dispatch({ type: 'patch-notifications', patch: { [row.key]: value } })
          }
        />
      }
    />
  );

  return (
    <Screen alt header={<Header title="Notifications" />}>
      <Card
        padding="base"
        onPress={() => {
          setOsAllowed((allowed) => !allowed);
        }}>
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <View
            style={[
              styles.chip,
              {
                borderRadius: theme.radius.md,
                backgroundColor: osAllowed ? theme.colors.shieldSoft : theme.colors.warnSoft,
              },
            ]}>
            <Icon
              name={osAllowed ? 'checkmark-circle' : 'notifications-off-outline'}
              size={20}
              color={osAllowed ? theme.colors.shield : theme.colors.warn}
            />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyStrong">
              {osAllowed ? 'Notifications are allowed' : 'Notifications are turned off'}
            </Text>
            <Text variant="sub" tone="secondary" style={{ marginTop: 2 }}>
              {osAllowed
                ? 'iOS Settings controls this, not Aegis.'
                : 'Nothing below can reach you until iOS Settings allows it.'}
            </Text>
          </View>
        </View>

        {osAllowed ? null : (
          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label="Open iOS Settings"
              variant="secondary"
              size="sm"
              icon="open-outline"
              fullWidth={false}
              onPress={() => showNote('The real app opens iOS Settings here.')}
            />
          </View>
        )}

        {note ? <InlineNote text={note} tone="muted" icon="information-circle-outline" /> : null}
      </Card>

      <Section title="Protection">
        <ListGroup>{PROTECTION_ROWS.map(renderRow)}</ListGroup>
      </Section>

      <Section title="Updates">
        <ListGroup>{UPDATE_ROWS.map(renderRow)}</ListGroup>
      </Section>

      <View
        style={[
          styles.row,
          { gap: theme.spacing.sm, marginTop: theme.spacing.xl, alignItems: 'flex-start' },
        ]}>
        <Icon name="eye-off-outline" size={16} color={theme.colors.textMuted} />
        <Text variant="caption" tone="muted" style={styles.flex}>
          A notification never names a site, an app or a search. It only ever tells you that
          something was blocked.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
