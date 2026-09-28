import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PinPad } from '@/components/protection';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  ProgressRing,
  Screen,
  Text,
  TextField,
} from '@/components/ui';
import { countdown, describeWaitingPeriod, elapsedFraction, relativeTime } from '@/lib/format';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  usePendingRequest,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';
import { PROTECTION_LEVELS, type DisableRequest, type ProtectionLevelId } from '@/types';

/** 'to' arrives as a URL string; only a real level id is worth acting on. */
function parseLevel(value: string | undefined): ProtectionLevelId | null {
  const parsed = Number(value);
  const match = PROTECTION_LEVELS.find((level) => level.id === parsed);
  return match ? match.id : null;
}

export default function DisableProtectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const level = useProtectionLevel();
  const partner = useActivePartner();
  const pending = usePendingRequest();

  const params = useLocalSearchParams<{ intent?: string; to?: string }>();

  const [pin, setPin] = useState('');
  const [wrongPin, setWrongPin] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [reason, setReason] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // A pending request already carries the intent it was raised with, so a
  // countdown survives leaving the screen and coming back.
  const lowerTo = pending
    ? pending.targetLevel
    : params.intent === 'lower-level'
      ? parseLevel(params.to)
      : null;
  const lowering = lowerTo !== null;
  const confirmLabel = lowering ? `Lower to level ${lowerTo}` : 'Turn protection off';

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const finish = useCallback(() => {
    if (lowerTo !== null) dispatch({ type: 'set-level', level: lowerTo });
    else dispatch({ type: 'set-protection', on: false });
    router.back();
  }, [dispatch, lowerTo, router]);

  // The reducer reads the request's own intent, so approving is a single
  // action whether it clears protection or only weakens the lock.
  const approveRequest = (request: DisableRequest) => {
    dispatch({ type: 'resolve-request', id: request.id, status: 'approved' });
    router.back();
  };

  const cancelRequest = (request: DisableRequest) => {
    dispatch({ type: 'resolve-request', id: request.id, status: 'cancelled' });
  };

  const startRequest = (method: DisableRequest['method']) => {
    const startedAt = Date.now();
    const minutes = method === 'delay' ? state.lock.waitingPeriodMinutes : 24 * 60;
    const written = reason.trim();

    dispatch({
      type: 'add-request',
      request: {
        id: `r_${startedAt}`,
        method,
        intent: lowerTo !== null ? 'lower-level' : 'disable',
        targetLevel: lowerTo,
        status: 'pending',
        reason: written,
        requestedAt: new Date(startedAt).toISOString(),
        resolvesAt: new Date(startedAt + minutes * 60_000).toISOString(),
        partnerId: method === 'partner' && partner ? partner.id : null,
      },
    });
    setReason('');
  };

  // Level 2 checks the PIN as soon as the last digit lands.
  const handlePin = (next: string) => {
    if (wrongPin) setWrongPin(false);

    if (next.length < 4) {
      setPin(next);
      return;
    }

    if (state.lock.pin && next === state.lock.pin) {
      setPin('');
      finish();
      return;
    }

    setWrongPin(true);
    setAttempts((count) => count + 1);
    setPin('');
  };

  const header = (
    <Header
      title={lowering ? 'Lower your lock' : 'Turn protection off'}
      subtitle={`Level ${level.id} · ${level.name}`}
      onBack={false}
      right={
        <Button
          label="Close"
          variant="ghost"
          size="sm"
          fullWidth={false}
          onPress={() => router.back()}
        />
      }
    />
  );

  if (!state.protectionOn && !lowering) {
    return (
      <Screen header={header} footer={<Button label="Done" onPress={() => router.back()} />}>
        <Card padding="lg">
          <View style={[styles.centered, { gap: theme.spacing.md }]}>
            <Icon name="shield-outline" size={40} color={theme.colors.textMuted} />
            <Text variant="h2" align="center">
              Protection is already off
            </Text>
            <Text variant="sub" tone="secondary" align="center">
              There’s nothing to unlock. You can switch it back on from the Protection tab
              whenever you want.
            </Text>
          </View>
        </Card>
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Level 1 — nothing stands in the way, so be honest about that.
  // -------------------------------------------------------------------------
  if (level.method === 'none') {
    return (
      <Screen
        header={header}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <Button label={confirmLabel} variant="danger" onPress={finish} />
            <Button label="Not now" variant="ghost" onPress={() => router.back()} />
          </View>
        }>
        <Card padding="lg">
          <View style={[styles.centered, { gap: theme.spacing.md }]}>
            <Icon name="lock-open-outline" size={40} color={theme.colors.textSecondary} />
            <Text variant="h2" align="center">
              {lowering ? `Lower your lock to level ${lowerTo}?` : 'Turn protection off?'}
            </Text>
            <Text variant="sub" tone="secondary" align="center">
              Your lock is set to Normal, so this happens right away — no waiting period, nobody
              to ask.
            </Text>
            <Text variant="sub" tone="secondary" align="center">
              You can turn this back on any time.
            </Text>
          </View>
        </Card>

        <Card
          padding="base"
          onPress={() => router.push('/protection/level')}
          style={{ marginTop: theme.spacing.md }}>
          <View style={[styles.row, { gap: theme.spacing.md }]}>
            <Icon name="trending-up-outline" size={20} color={theme.colors.brand} />
            <Text variant="sub" tone="secondary" style={styles.flex}>
              If you’d like this to be harder next time, raise your protection level.
            </Text>
            <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </View>
        </Card>
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Level 2 — the PIN.
  // -------------------------------------------------------------------------
  if (level.method === 'pin') {
    if (!state.lock.pin) {
      return (
        <Screen header={header}>
          <EmptyState
            icon="keypad-outline"
            title="No PIN set yet"
            description="Your lock is set to Locked, but there’s no PIN to check. Set one in Lock settings."
            action={{ label: 'Open lock settings', onPress: () => router.push('/protection/lock') }}
          />
        </Screen>
      );
    }

    return (
      <Screen header={header} footer={<Button label="Not now" variant="ghost" onPress={() => router.back()} />}>
        <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.xl }}>
          <Text variant="h2" align="center">
            Enter your PIN
          </Text>
          <Text variant="sub" tone={wrongPin ? 'danger' : 'secondary'} align="center">
            {wrongPin
              ? 'That PIN didn’t match. Try again.'
              : lowering
                ? `Your PIN unlocks the change to level ${lowerTo}.`
                : 'Your PIN is the thing you put here on purpose.'}
          </Text>
        </View>

        <PinPad value={pin} error={wrongPin} onChange={handlePin} />

        {attempts >= 3 ? (
          <Card padding="base" style={{ marginTop: theme.spacing.xl, backgroundColor: theme.colors.warnSoft }}>
            <View style={[styles.row, { gap: theme.spacing.md }]}>
              <Icon name="leaf-outline" size={20} color={theme.colors.warn} />
              <Text variant="sub" tone="secondary" style={styles.flex}>
                Take a breath. Nothing is locked out and nothing is wrong. If you still want this
                in ten minutes, the PIN will still be here.
              </Text>
            </View>
          </Card>
        ) : null}
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Level 3 — the waiting period.
  // -------------------------------------------------------------------------
  if (level.method === 'delay') {
    const active = pending && pending.method === 'delay' ? pending : null;

    if (!active) {
      return (
        <Screen
          header={header}
          footer={
            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label="Start the waiting period"
                icon="hourglass-outline"
                onPress={() => startRequest('delay')}
              />
              <Button label="Not now" variant="ghost" onPress={() => router.back()} />
            </View>
          }>
          <Card padding="lg">
            <View style={[styles.centered, { gap: theme.spacing.md }]}>
              <Icon name="hourglass-outline" size={40} color={theme.colors.warn} />
              <Text variant="h2" align="center">
                {describeWaitingPeriod(state.lock.waitingPeriodMinutes)} first
              </Text>
              <Text variant="sub" tone="secondary" align="center">
                {lowering
                  ? `Lowering your lock to level ${lowerTo} starts a ${describeWaitingPeriod(state.lock.waitingPeriodMinutes)} wait. Your lock stays where it is until the timer ends.`
                  : `Protection stays on for ${describeWaitingPeriod(state.lock.waitingPeriodMinutes)}. When the timer ends, turning it off is one tap away.`}
              </Text>
              <Text variant="sub" tone="secondary" align="center">
                You can cancel the wait at any point, and nothing changes.
              </Text>
            </View>
          </Card>

          <View style={{ marginTop: theme.spacing.lg }}>
            <TextField
              label="Why now? (optional)"
              hint="Only you see this. It’s worth reading again when the timer ends."
              placeholder="Something I want to be honest about…"
              value={reason}
              onChangeText={setReason}
              multiline
              style={styles.reason}
            />
          </View>
        </Screen>
      );
    }

    const ready = new Date(active.resolvesAt).getTime() <= now;
    const written = active.reason;

    return (
      <Screen
        header={header}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            {ready ? (
              <Button label={confirmLabel} variant="danger" onPress={() => approveRequest(active)} />
            ) : null}
            <Button
              label="Cancel request"
              variant={ready ? 'ghost' : 'secondary'}
              onPress={() => cancelRequest(active)}
            />
          </View>
        }>
        <View style={[styles.centered, { gap: theme.spacing.lg }]}>
          <ProgressRing
            progress={elapsedFraction(active.requestedAt, active.resolvesAt, now)}
            size={230}
            thickness={14}
            colors={ready ? theme.colors.shieldGradient : [theme.colors.warn, theme.colors.warn]}>
            <Text variant="display" rounded align="center">
              {countdown(active.resolvesAt, now)}
            </Text>
            <Text variant="caption" tone="muted">
              {ready ? 'the wait is over' : 'left to wait'}
            </Text>
          </ProgressRing>

          <Badge
            label={ready ? 'Waiting period complete' : 'Protection is still on'}
            tone={ready ? 'shield' : 'warn'}
            dot
          />

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="h2" align="center">
              {ready ? 'The wait is done' : 'Protection stays on for now'}
            </Text>
            <Text variant="sub" tone="secondary" align="center">
              {ready
                ? 'You waited it out. That counts for something either way — whatever you choose now, you chose it awake.'
                : `You asked ${relativeTime(active.requestedAt).toLowerCase()}. Nothing else needs doing; most urges pass long before a countdown does. Close the app and come back later.`}
            </Text>
          </View>
        </View>

        {written ? (
          <Card padding="base" style={{ marginTop: theme.spacing.xl }}>
            <Text variant="label" tone="muted">
              What you wrote
            </Text>
            <Text variant="sub" style={{ marginTop: theme.spacing.sm }}>
              {written}
            </Text>
          </Card>
        ) : null}
      </Screen>
    );
  }

  // -------------------------------------------------------------------------
  // Level 4 — a person has to say yes.
  // -------------------------------------------------------------------------
  const active = pending && pending.method === 'partner' ? pending : null;

  if (!partner) {
    return (
      <Screen header={header}>
        <EmptyState
          icon="people-outline"
          title="No partner yet"
          description="Your lock asks someone you trust to approve this. Choose a partner first — they only ever see your requests, never your browsing history."
          action={{
            label: 'Choose a partner',
            onPress: () => router.push('/(tabs)/accountability'),
          }}
        />
      </Screen>
    );
  }

  if (active) {
    const written = active.reason;

    return (
      <Screen
        header={header}
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <Button label="Cancel request" variant="secondary" onPress={() => cancelRequest(active)} />
            <Button
              label="Simulate approval (demo shortcut)"
              variant="ghost"
              size="sm"
              onPress={() => approveRequest(active)}
            />
          </View>
        }>
        <View style={[styles.centered, { gap: theme.spacing.base }]}>
          <Avatar initials={partner.initials} size={72} />
          <Text variant="h2" align="center">
            Waiting for {partner.name} to respond
          </Text>
          <Badge label={`Sent ${relativeTime(active.requestedAt).toLowerCase()}`} tone="warn" dot />
          <Text variant="sub" tone="secondary" align="center">
            Protection stays exactly as it is until {partner.name.split(' ')[0]} replies. Asking
            someone is not a failure — it’s the whole point of this level.
          </Text>
        </View>

        {written ? (
          <Card padding="base" style={{ marginTop: theme.spacing.xl }}>
            <Text variant="label" tone="muted">
              What {partner.name.split(' ')[0]} sees
            </Text>
            <Text variant="sub" style={{ marginTop: theme.spacing.sm }}>
              {written}
            </Text>
          </Card>
        ) : null}

        <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.lg }}>
          The demo shortcut above stands in for your partner’s own app.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={`Send request to ${partner.name.split(' ')[0]}`}
            icon="paper-plane-outline"
            disabled={reason.trim().length === 0}
            onPress={() => startRequest('partner')}
          />
          <Button label="Not now" variant="ghost" onPress={() => router.back()} />
        </View>
      }>
      <Card padding="lg">
        <View style={[styles.row, { gap: theme.spacing.base }]}>
          <Avatar initials={partner.initials} size={48} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{partner.name}</Text>
            <Text variant="sub" tone="secondary" style={{ marginTop: 2 }}>
              {partner.relationship} · approves your requests
            </Text>
          </View>
        </View>

        <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.base }}>
          {lowering
            ? `${partner.name.split(' ')[0]} has to approve lowering your lock to level ${lowerTo}. Nothing changes until they do.`
            : `Protection stays on until ${partner.name.split(' ')[0]} approves. They never see your browsing history — only the note below.`}
        </Text>
      </Card>

      <View style={{ marginTop: theme.spacing.lg }}>
        <TextField
          label="Why do you want to turn this off?"
          hint="A sentence is enough. Honest is better than tidy."
          placeholder="I want to turn it off because…"
          value={reason}
          onChangeText={setReason}
          multiline
          style={styles.reason}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  reason: { minHeight: 88, textAlignVertical: 'top' },
});
