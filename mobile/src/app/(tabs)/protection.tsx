import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TAB_BAR_CLEARANCE } from '@/components/navigation/tab-bar';
import {
  Badge,
  Button,
  Card,
  Divider,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  StrengthMeter,
  Text,
  Toggle,
} from '@/components/ui';
import { PROTECTION_CATEGORIES } from '@/data/seed';
import { coverageOf, describeEnforcement, isReassuring, useFilter } from '@/lib/filter';
import { countdown, describeWaitingPeriod, plural, relativeTime } from '@/lib/format';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  useIsPremium,
  usePendingRequest,
  useProtectedDevices,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';

export default function ProtectionTabScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const filter = useFilter();
  const level = useProtectionLevel();
  const partner = useActivePartner();
  const pending = usePendingRequest();
  const protectedDevices = useProtectedDevices();
  const isPremium = useIsPremium();

  /*
    The hero reports the device, not the account. `state.protectionOn` alone
    would render a green "Protection is on" while this phone sits waiting for
    VPN consent — telling someone they are covered when nothing is being
    filtered. The amber branch exists so that claim is never made falsely.
  */
  const coverage = coverageOf(state.protectionOn, filter.state);
  const on = isReassuring(coverage);
  const gap = coverage.kind === 'gap';

  return (
    <Screen
      header={<Header title="Protection" onBack={false} large />}
      bottomInset={TAB_BAR_CLEARANCE}>
      <Card
        padding="lg"
        gradient={on ? theme.colors.shieldGradient : undefined}
        style={
          on
            ? undefined
            : {
                backgroundColor: gap ? theme.colors.warnSoft : theme.colors.dangerSoft,
                borderWidth: 1,
                borderColor: gap ? theme.colors.warn : theme.colors.danger,
              }
        }>
        <View style={[styles.hero, { gap: theme.spacing.md }]}>
          <Icon
            name={on ? 'shield-checkmark' : gap ? 'shield-half-outline' : 'shield-outline'}
            size={46}
            color={
              on ? theme.colors.textOnAccent : gap ? theme.colors.warn : theme.colors.danger
            }
          />

          <Text variant="h1" align="center" tone={on ? 'onAccent' : 'default'}>
            {on ? 'Protection is on' : gap ? 'Not filtering here' : 'Protection is off'}
          </Text>

          <Text
            variant="sub"
            align="center"
            tone={on ? 'onAccent' : 'secondary'}
            style={on ? styles.heroSub : undefined}>
            {on
              ? `Adult content is blocked on ${plural(protectedDevices.length, 'device')}. Turning it off goes through your protection lock.`
              : gap
                ? 'Protection is on for your account, but this phone is not filtering — so nothing is being blocked here yet.'
                : 'Nothing is being filtered right now. Turning it back on takes one tap, whenever you’re ready.'}
          </Text>

          <View style={[styles.heroAction, { marginTop: theme.spacing.sm }]}>
            {state.protectionOn ? (
              <Button
                label="Turn protection off"
                variant="secondary"
                icon="lock-open-outline"
                // Never dispatched directly: the lock decides whether this is allowed.
                onPress={() => router.push('/protection/disable')}
              />
            ) : (
              <Button
                label="Turn protection on"
                variant="shield"
                icon="shield-checkmark"
                onPress={() => dispatch({ type: 'set-protection', on: true })}
              />
            )}
          </View>
        </View>
      </Card>

      {/*
        What the device is actually doing, as distinct from what the account says.
        "Protection ON" is an intent; whether this phone is filtering is a fact,
        and the two can disagree — no consent yet, another VPN holding the slot,
        or a platform with no datapath at all. Showing only the intent is how an
        app ends up telling someone they are protected when they are not.
      */}
      {filter.state.kind !== 'idle' && filter.state.kind !== 'filtering' ? (
        <Card
          padding="base"
          style={{
            marginTop: theme.spacing.md,
            backgroundColor:
              filter.state.kind === 'revoked' || filter.state.kind === 'failed'
                ? theme.colors.dangerSoft
                : theme.colors.warnSoft,
          }}>
          <View style={[styles.pending, { gap: theme.spacing.md }]}>
            <Icon
              name={
                filter.state.kind === 'revoked'
                  ? 'warning-outline'
                  : filter.state.kind === 'starting'
                    ? 'hourglass-outline'
                    : 'information-circle-outline'
              }
              size={20}
              color={
                filter.state.kind === 'revoked' || filter.state.kind === 'failed'
                  ? theme.colors.danger
                  : theme.colors.warn
              }
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                {filter.state.kind === 'revoked'
                  ? 'Not filtering on this device'
                  : filter.state.kind === 'needs-consent'
                    ? 'One permission needed'
                    : filter.state.kind === 'unsupported'
                      ? 'Not available on this device'
                      : filter.state.kind === 'starting'
                        ? 'Starting'
                        : 'Could not start filtering'}
              </Text>
              <Text variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                {describeEnforcement(filter.state)}
              </Text>
            </View>
          </View>

          {filter.state.kind === 'needs-consent' ? (
            <Button
              label="Allow filtering"
              variant="secondary"
              size="sm"
              icon="shield-checkmark-outline"
              style={{ marginTop: theme.spacing.md }}
              onPress={() => void filter.requestConsent()}
            />
          ) : null}

          {filter.state.kind === 'failed' || filter.state.kind === 'revoked' ? (
            <Button
              label="Try again"
              variant="ghost"
              size="sm"
              icon="refresh-outline"
              style={{ marginTop: theme.spacing.md }}
              onPress={filter.retry}
            />
          ) : null}
        </Card>
      ) : null}

      {pending && on ? (
        <Card
          padding="base"
          onPress={() => router.push('/protection/disable')}
          style={{ marginTop: theme.spacing.md, backgroundColor: theme.colors.warnSoft }}>
          <View style={[styles.pending, { gap: theme.spacing.md }]}>
            <Icon
              name={pending.method === 'delay' ? 'hourglass-outline' : 'paper-plane-outline'}
              size={20}
              color={theme.colors.warn}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                {pending.method === 'delay'
                  ? 'Waiting period running'
                  : `Waiting for ${partner ? partner.name : 'your partner'}`}
              </Text>
              <Text variant="caption" tone="secondary" style={{ marginTop: 2 }}>
                {pending.method === 'delay'
                  ? `${countdown(pending.resolvesAt)} left · protection stays on until then`
                  : `Sent ${relativeTime(pending.requestedAt).toLowerCase()} · protection stays on until they reply`}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </View>
        </Card>
      ) : null}

      <Section
        title="Protection lock"
        description="Protection is what gets blocked. The lock is what it takes to turn protection off.">
        <Card padding="lg">
          <View style={[styles.lockHead, { gap: theme.spacing.md }]}>
            <Text variant="h3" style={styles.flex}>
              {level.name}
            </Text>
            <Badge
              label={`Level ${level.id}`}
              tone={level.strength >= 3 ? 'shield' : level.strength === 2 ? 'warn' : 'neutral'}
            />
          </View>

          <View style={{ marginTop: theme.spacing.md }}>
            <StrengthMeter value={level.strength} />
          </View>

          <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.md }}>
            {level.description}
          </Text>

          {level.method === 'delay' ? (
            <Text variant="sub" style={{ marginTop: theme.spacing.sm }}>
              Your waiting period is{' '}
              <Text variant="sub" tone="shield">
                {describeWaitingPeriod(state.lock.waitingPeriodMinutes)}
              </Text>
              .
            </Text>
          ) : null}

          {level.method === 'partner' ? (
            partner ? (
              <Text variant="sub" style={{ marginTop: theme.spacing.sm }}>
                <Text variant="sub" tone="shield">
                  {partner.name}
                </Text>{' '}
                approves any request to turn protection off. They never see your browsing history.
              </Text>
            ) : (
              <Card
                padding="sm"
                onPress={() => router.push('/(tabs)/accountability')}
                style={{ marginTop: theme.spacing.md, backgroundColor: theme.colors.warnSoft }}>
                <View style={[styles.lockHead, { gap: theme.spacing.sm }]}>
                  <View style={styles.flex}>
                    <Badge label="Action needed" tone="warn" icon="alert-circle" />
                    <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
                      Choose a partner to finish setting this up.
                    </Text>
                  </View>
                  <Icon name="chevron-forward" size={18} color={theme.colors.warn} />
                </View>
              </Card>
            )
          ) : null}

          <View style={{ marginTop: theme.spacing.base }}>
            <Divider />
            <ListRow
              title="Protection level"
              subtitle={`Level ${level.id} · ${level.name}`}
              icon="options-outline"
              onPress={() => router.push('/protection/level')}
              divider
            />
            <ListRow
              title="Lock settings"
              subtitle="PIN, waiting period and approver"
              icon="key-outline"
              onPress={() => router.push('/protection/lock')}
            />
          </View>
        </Card>
      </Section>

      <Section
        title="What’s blocked"
        description={
          isPremium ? undefined : 'Safe search and gambling filters come with Premium.'
        }>
        <Card padding="lg">
          {PROTECTION_CATEGORIES.map((category, index) => {
            const locked = category.premium && !isPremium;
            const enabled = state.enabledCategories.includes(category.id);
            const last = index === PROTECTION_CATEGORIES.length - 1;

            return (
              <ListRow
                key={category.id}
                title={category.title}
                subtitle={category.description}
                icon={category.icon}
                iconColor={locked ? theme.colors.textMuted : theme.colors.shield}
                divider={!last}
                chevron={false}
                onPress={locked ? () => router.push('/subscription') : undefined}
                trailing={
                  locked ? (
                    <Badge label="Premium" tone="brand" icon="lock-closed" />
                  ) : (
                    <Toggle
                      value={enabled}
                      accessibilityLabel={category.title}
                      onValueChange={() => dispatch({ type: 'toggle-category', id: category.id })}
                    />
                  )
                }
              />
            );
          })}
        </Card>
      </Section>

      <Section title="Protection status">
        <Card padding="lg">
          <ListRow
            title="Adult content protection"
            subtitle={`Blocklist is up to date · updated ${relativeTime(state.blocklist.lastCheckedAt).toLowerCase()}`}
            icon="list-outline"
            onPress={() => router.push('/blocklist')}
            trailing={
              <Icon name="checkmark-circle" size={20} color={theme.colors.shield} />
            }
          />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center' },
  heroSub: { opacity: 0.92 },
  heroAction: { alignSelf: 'stretch' },
  pending: { flexDirection: 'row', alignItems: 'center' },
  lockHead: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
