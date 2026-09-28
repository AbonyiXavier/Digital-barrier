import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LockMechanismCard, SetPinFlow } from '@/components/protection';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Header,
  ListRow,
  Screen,
  Section,
  Segmented,
  Text,
} from '@/components/ui';
import { describeWaitingPeriod } from '@/lib/format';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';
import type { WaitingPeriodMinutes } from '@/types';

const WAITING_PERIODS: readonly WaitingPeriodMinutes[] = [15, 60, 1440, 2880];

export default function ProtectionLockScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const level = useProtectionLevel();
  const partner = useActivePartner();

  const [editingPin, setEditingPin] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);

  const handlePinDone = useCallback(
    (pin: string) => {
      dispatch({ type: 'set-pin', pin });
      setEditingPin(false);
      setPinSaved(true);
    },
    [dispatch],
  );

  return (
    <Screen header={<Header title="Protection lock" />}>
      <Card padding="lg">
        <Text variant="h2">The lock is what stands between an urge and an open door.</Text>
        <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.md }}>
          Protection can be switched on any time. The lock only guards the way out, so a decision
          you made on a clear day still holds on a harder one.
        </Text>

        <View style={{ marginTop: theme.spacing.base }}>
          <ListRow
            title={`Level ${level.id} · ${level.name}`}
            subtitle={level.tagline}
            icon="options-outline"
            onPress={() => router.push('/protection/level')}
          />
        </View>
      </Card>

      <Section
        title="Mechanisms"
        description={
          level.method === 'none'
            ? 'Your lock is set to Normal, so none of these are in use yet. You can still set them up now.'
            : 'Each level uses one of these. The others stay editable, so you can set them up before you need them.'
        }>
        <View style={{ gap: theme.spacing.md }}>
          <LockMechanismCard
            icon="keypad-outline"
            title="PIN"
            appliesTo="Used at level 2 · Locked"
            active={level.method === 'pin'}>
            {editingPin ? (
              <SetPinFlow onDone={handlePinDone} onCancel={() => setEditingPin(false)} />
            ) : (
              <>
                <View style={[styles.row, { gap: theme.spacing.md }]}>
                  <Text variant="sub" tone="secondary" style={styles.flex}>
                    {state.lock.pin
                      ? 'A 4-digit PIN is set. It’s asked for whenever protection is turned off at level 2.'
                      : 'No PIN yet. Level 2 can’t hold anything back until you set one.'}
                  </Text>
                  {state.lock.pin ? (
                    <Badge label="Set" tone="shield" icon="checkmark" />
                  ) : (
                    <Badge label="Not set" tone="warn" />
                  )}
                </View>

                {pinSaved ? (
                  <Text variant="caption" tone="shield">
                    PIN updated.
                  </Text>
                ) : null}

                <Button
                  label={state.lock.pin ? 'Change PIN' : 'Set a PIN'}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => {
                    setPinSaved(false);
                    setEditingPin(true);
                  }}
                />
              </>
            )}
          </LockMechanismCard>

          <LockMechanismCard
            icon="hourglass-outline"
            title="Waiting period"
            appliesTo="Used at level 3 · Waiting period"
            active={level.method === 'delay'}>
            <Segmented
              options={WAITING_PERIODS.map((minutes) => ({
                value: String(minutes),
                label: describeWaitingPeriod(minutes),
              }))}
              value={String(state.lock.waitingPeriodMinutes)}
              onChange={(next) => {
                const minutes = WAITING_PERIODS.find((option) => String(option) === next);
                if (minutes) dispatch({ type: 'set-waiting-period', minutes });
              }}
            />
            <Text variant="sub" tone="secondary">
              Protection stays on for {describeWaitingPeriod(state.lock.waitingPeriodMinutes)} after
              you ask to turn it off. You can cancel the wait at any point, and nothing changes.
            </Text>
          </LockMechanismCard>

          <LockMechanismCard
            icon="people-outline"
            title="Accountability approver"
            appliesTo="Used at level 4 · Accountability"
            active={level.method === 'partner'}>
            {partner ? (
              <ListRow
                title={partner.name}
                subtitle={partner.relationship}
                leading={<Avatar initials={partner.initials} size={38} />}
                onPress={() => router.push('/(tabs)/accountability')}
              />
            ) : (
              <ListRow
                title="Not set"
                subtitle="Choose someone from your accountability partners"
                icon="person-add-outline"
                onPress={() => router.push('/(tabs)/accountability')}
              />
            )}
            <Text variant="sub" tone="secondary">
              Your approver sees the reason you write and nothing else. They never see your
              browsing history.
            </Text>
          </LockMechanismCard>
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
