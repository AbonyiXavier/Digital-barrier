import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GreetingHeader } from '@/components/dashboard/greeting-header';
import { ProtectionHero } from '@/components/dashboard/protection-hero';
import { TAB_BAR_CLEARANCE } from '@/components/navigation/tab-bar';
import {
  Badge,
  Card,
  Icon,
  ListRow,
  Screen,
  Section,
  Sparkline,
  StatTile,
  Text,
} from '@/components/ui';
import { coverageOf, useFilter } from '@/lib/filter';
import {
  describeWaitingPeriod,
  plural,
  relativeTime,
  weekdayLabels,
} from '@/lib/format';
import {
  useActivePartner,
  useAppState,
  useIsPremium,
  useProtectedDays,
  useProtectedDevices,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useAppState();
  const filter = useFilter();
  const coverage = coverageOf(state.protectionOn, filter.state);
  const level = useProtectionLevel();
  const partner = useActivePartner();
  const isPremium = useIsPremium();
  const protectedDays = useProtectedDays();
  const protectedDevices = useProtectedDevices();

  const weekTotal = sum(state.weeklyBlocks);

  const lockDetail =
    level.id === 3
      ? `${describeWaitingPeriod(state.lock.waitingPeriodMinutes)} before it can come off`
      : level.tagline;

  return (
    <Screen bottomInset={TAB_BAR_CLEARANCE}>
      <GreetingHeader />

      <View style={{ marginTop: theme.spacing.xl }}>
        <ProtectionHero />
      </View>

      <View style={[styles.stats, { marginTop: theme.spacing['2xl'], gap: theme.spacing.md }]}>
        <StatTile
          value={String(state.blocksToday)}
          label="Blocked today"
          icon="hand-left-outline"
          tone="brand"
        />
        <StatTile
          value={String(protectedDays)}
          label={protectedDays === 1 ? 'Day protected' : 'Days protected'}
          icon="calendar-outline"
          tone="shield"
        />
        <StatTile
          value={String(protectedDevices.length)}
          label={protectedDevices.length === 1 ? 'Device covered' : 'Devices covered'}
          icon="phone-portrait-outline"
        />
      </View>

      <Section title="This week">
        <Card>
          <Sparkline
            data={state.weeklyBlocks}
            labels={weekdayLabels()}
            color={theme.colors.brand}
          />
          <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.md }}>
            {weekTotal === 0
              ? 'Nothing was blocked in the last 7 days.'
              : `${plural(weekTotal, 'attempt')} blocked in the last 7 days.`}
          </Text>
        </Card>
      </Section>

      <Section title="Your setup">
        <Card padding="none">
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              title="Protection"
              subtitle={
                coverage.kind === 'gap'
                  ? 'On, but this device is not filtering'
                  : state.protectionOn
                    ? 'Filtering is running on your devices'
                    : 'Filtering is switched off'
              }
              icon="shield-checkmark"
              iconColor={
                coverage.kind === 'gap'
                  ? theme.colors.warn
                  : state.protectionOn
                    ? theme.colors.shield
                    : theme.colors.danger
              }
              trailing={
                <Badge
                  label={
                    coverage.kind === 'gap' ? 'CHECK' : state.protectionOn ? 'ON' : 'OFF'
                  }
                  tone={
                    coverage.kind === 'gap' ? 'warn' : state.protectionOn ? 'shield' : 'danger'
                  }
                  dot={state.protectionOn && coverage.kind !== 'gap'}
                />
              }
              onPress={() => router.push('/(tabs)/protection')}
              divider
            />

            <ListRow
              title="Lock"
              subtitle={`${level.name} · ${lockDetail}`}
              icon="lock-closed"
              iconColor={theme.colors.brand}
              onPress={() => router.push('/protection/level')}
              divider
            />

            <ListRow
              title="Accountability"
              subtitle={partner ? `${partner.name} · ${partner.relationship}` : 'Off'}
              icon="people"
              iconColor={theme.colors.brand}
              onPress={() => router.push('/(tabs)/accountability')}
            />
          </View>
        </Card>
      </Section>

      <Section title="Protection status">
        <Card padding="none">
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              title="Blocklist is up to date"
              subtitle={`Checked ${relativeTime(state.blocklist.lastCheckedAt).toLowerCase()}`}
              leading={
                <View
                  style={[
                    styles.chip,
                    {
                      backgroundColor: theme.colors.shieldSoft,
                      borderRadius: theme.radius.md,
                    },
                  ]}>
                  <Icon name="checkmark-circle" size={20} color={theme.colors.shield} />
                </View>
              }
              onPress={() => router.push('/blocklist')}
            />
          </View>
        </Card>
      </Section>

      {!isPremium ? (
        <View style={{ marginTop: theme.spacing.xl }}>
          <Card gradient={theme.colors.brandGradient} onPress={() => router.push('/subscription')}>
            <View style={[styles.upgrade, { gap: theme.spacing.base }]}>
              <View style={styles.upgradeText}>
                <Text variant="bodyStrong" tone="onAccent">
                  Cover every device
                </Text>
                <Text variant="sub" tone="onAccent" style={{ marginTop: 4, opacity: 0.85 }}>
                  Premium adds the waiting period, an accountability partner, and every device you
                  use. Here when you want it.
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={theme.colors.textOnAccent} />
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
  chip: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  upgrade: { flexDirection: 'row', alignItems: 'center' },
  upgradeText: { flex: 1 },
});
