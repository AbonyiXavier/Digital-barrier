import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  OptionCard,
  Screen,
  Section,
  Text,
  Toggle,
  type IconName,
} from '@/components/ui';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';
import type { ApprovalSettings } from '@/types';

type ToggleKey = 'notifyOnDisable' | 'notifyOnLevelChange' | 'weeklyDigest';

type SettingRow = { key: ToggleKey; title: string; subtitle: string; icon: IconName };

const ROWS: readonly SettingRow[] = [
  {
    key: 'notifyOnDisable',
    title: 'When protection is turned off',
    subtitle: 'They get a short note the moment it stops — no reason, no detail, just the fact.',
    icon: 'shield-half-outline',
  },
  {
    key: 'notifyOnLevelChange',
    title: 'When the protection level is lowered',
    subtitle: 'They hear if the lock gets easier to undo, for example a waiting period becoming a PIN.',
    icon: 'trending-down-outline',
  },
  {
    key: 'weeklyDigest',
    title: 'Weekly summary instead of individual alerts',
    subtitle: 'One quiet message at the end of the week rather than a message each time.',
    icon: 'calendar-outline',
  },
];

export default function ApprovalSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { approvalSettings, partners } = useAppState();
  const approver = useActivePartner();
  const level = useProtectionLevel();

  const activePartners = partners.filter((p) => p.status === 'active');

  const setFlag = (key: ToggleKey, value: boolean) => {
    const patch: Partial<ApprovalSettings> =
      key === 'notifyOnDisable'
        ? { notifyOnDisable: value }
        : key === 'notifyOnLevelChange'
          ? { notifyOnLevelChange: value }
          : { weeklyDigest: value };

    dispatch({ type: 'patch-approval-settings', patch });
  };

  return (
    <Screen header={<Header title="Approval settings" />}>
      <Text variant="sub" tone="secondary">
        Decide how much your partner hears, and when. Every one of these is about a moment you
        choose to have — never about what you look at.
      </Text>

      <Section title="What your partner is told">
        <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
          {ROWS.map((row, index) => (
            <ListRow
              key={row.key}
              icon={row.icon}
              title={row.title}
              subtitle={row.subtitle}
              chevron={false}
              divider={index < ROWS.length - 1}
              onPress={() => setFlag(row.key, !approvalSettings[row.key])}
              trailing={
                <Toggle
                  value={approvalSettings[row.key]}
                  onValueChange={(next) => setFlag(row.key, next)}
                  accessibilityLabel={row.title}
                />
              }
            />
          ))}
        </Card>
      </Section>

      <Section title="Never shared">
        <Card variant="outlined" style={{ paddingHorizontal: theme.spacing.base }} padding="none">
          <ListRow
            icon="eye-off-outline"
            iconColor={theme.colors.textMuted}
            title="Browsing activity"
            subtitle="Never shared. Not a setting — a guarantee."
            chevron={false}
            trailing={
              <View style={[styles.trailing, { gap: theme.spacing.sm }]}>
                <Icon name="lock-closed" size={14} color={theme.colors.textMuted} />
                <Toggle value={false} disabled onValueChange={() => {}} />
              </View>
            }
          />
        </Card>

        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
          The sites you visit, your searches and anything you read stay on your device. There is no
          switch here, and no version of this app where there is one.
        </Text>
      </Section>

      <Section
        title="Approver"
        description="Who answers when you ask to turn protection off at protection level 4.">
        {activePartners.length === 0 ? (
          <Card variant="outlined">
            <Text variant="bodyStrong">No one can approve yet</Text>
            <Text variant="sub" tone="secondary" style={{ marginTop: 4 }}>
              Only a partner who has accepted their invitation can approve a request. Invite
              someone, or wait for the invitation you already sent.
            </Text>
            <Button
              label="Invite someone"
              icon="person-add-outline"
              size="sm"
              variant="secondary"
              fullWidth={false}
              style={{ marginTop: theme.spacing.md }}
              onPress={() => router.push('/accountability/invite')}
            />
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {activePartners.map((partner) => (
              <OptionCard
                key={partner.id}
                title={partner.name}
                description={`${partner.relationship} · ${partner.email}`}
                icon="person-circle-outline"
                indicator="radio"
                selected={approver?.id === partner.id}
                onPress={() => dispatch({ type: 'set-lock-partner', partnerId: partner.id })}
              />
            ))}
          </View>
        )}
      </Section>

      <Section gap={theme.spacing.md}>
        <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
          <ListRow
            icon="information-circle-outline"
            title={`Your lock is set to ${level.name}`}
            subtitle={
              level.id === 4
                ? 'Partner approval is in use, so this choice is live right now.'
                : 'Approval is only asked for at protection level 4. Tap to see the levels.'
            }
            onPress={() => router.push('/protection/level')}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
