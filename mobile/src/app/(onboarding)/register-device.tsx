import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { NumberedStep, SoftGlow, firstParam } from '@/components/onboarding';
import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  ProgressRing,
  Screen,
  Stepper,
  Text,
} from '@/components/ui';
import { platformIcon } from '@/lib/format';
import { useTheme } from '@/theme';
import type { DevicePlatform } from '@/types';

type Phase = 'idle' | 'installing' | 'done';

const TICK_MS = 80;
const TOTAL_TICKS = 30;

const STEPS = [
  {
    title: 'Install a secure profile',
    description: 'A local profile that points this phone at the Aegis resolver.',
  },
  {
    title: 'DNS filtering turns on',
    description: 'Blocked domains stop resolving, in every browser and every app.',
  },
  {
    title: 'Protection survives a restart',
    description: 'It comes back on its own after a reboot, with nothing to reopen.',
  },
] as const;

const platform: DevicePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
const DEVICE_NAME = Platform.OS === 'ios' ? 'This iPhone' : 'This Android phone';

function statusCopy(phase: Phase, progress: number): string {
  if (phase === 'idle') return 'Not protected yet';
  if (phase === 'done') return 'Protected · filtering every request';
  if (progress < 0.34) return 'Installing the secure profile…';
  if (progress < 0.7) return 'Turning on DNS filtering…';
  return 'Making it survive a restart…';
}

export default function RegisterDeviceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; email?: string; categories?: string }>();

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ticks = useRef(0);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  // A screen left mid-install must not keep ticking.
  useEffect(() => stop, []);

  const install = () => {
    if (phase !== 'idle') return;
    ticks.current = 0;
    setProgress(0);
    setPhase('installing');

    timer.current = setInterval(() => {
      ticks.current += 1;
      const value = Math.min(1, ticks.current / TOTAL_TICKS);
      setProgress(value);

      if (value >= 1) {
        stop();
        setPhase('done');
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    }, TICK_MS);
  };

  const next = () =>
    router.push({
      pathname: '/(onboarding)/complete',
      params: {
        name: firstParam(params.name, ''),
        email: firstParam(params.email, ''),
        categories: firstParam(params.categories, ''),
      },
    });

  const done = phase === 'done';

  return (
    <Screen
      header={
        <Header
          large
          title="Protect this device"
          subtitle="One install and this phone is covered, browser by browser."
          right={<Stepper current={3} total={4} />}
        />
      }
      footer={
        done ? (
          <Button label="Continue" size="lg" onPress={next} />
        ) : (
          <Button
            label={phase === 'installing' ? 'Installing' : 'Install protection'}
            size="lg"
            loading={phase === 'installing'}
            onPress={install}
          />
        )
      }>
      <Card variant="outlined" padding="base" style={{ marginTop: theme.spacing.base }}>
        <View style={[styles.deviceRow, { gap: theme.spacing.base }]}>
          <View
            style={[
              styles.deviceIcon,
              {
                backgroundColor: done ? theme.colors.shieldSoft : theme.colors.surfaceAlt,
                borderRadius: theme.radius.md,
              },
            ]}>
            <Icon
              name={platformIcon(platform)}
              size={22}
              color={done ? theme.colors.shield : theme.colors.textSecondary}
            />
          </View>

          <View style={styles.flex}>
            <Text variant="bodyStrong">{DEVICE_NAME}</Text>
            <Text
              variant="sub"
              tone={done ? 'shield' : 'secondary'}
              style={{ marginTop: 2 }}
              numberOfLines={1}>
              {statusCopy(phase, progress)}
            </Text>
          </View>

          {done ? <Badge label="Protected" tone="shield" dot /> : null}
        </View>
      </Card>

      {phase === 'idle' ? (
        <View style={[styles.steps, { gap: theme.spacing.lg, marginTop: theme.spacing.xl }]}>
          <Text variant="label" tone="muted">
            What happens next
          </Text>
          {STEPS.map((step, index) => (
            <NumberedStep
              key={step.title}
              index={index + 1}
              title={step.title}
              description={step.description}
            />
          ))}
        </View>
      ) : (
        <View style={[styles.progress, { marginTop: theme.spacing['2xl'] }]}>
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <SoftGlow size={240} tone={done ? 'shield' : 'brand'} />
          </View>

          <ProgressRing
            progress={progress}
            size={168}
            thickness={12}
            colors={done ? theme.colors.shieldGradient : theme.colors.brandGradient}>
            {done ? (
              <Icon name="shield-checkmark" size={52} color={theme.colors.shield} />
            ) : (
              <Text variant="display" rounded>
                {Math.round(progress * 100)}
              </Text>
            )}
          </ProgressRing>

          <Text
            variant="bodyStrong"
            tone={done ? 'shield' : 'default'}
            align="center"
            style={{ marginTop: theme.spacing.lg }}>
            {done ? 'Protection is on' : statusCopy(phase, progress)}
          </Text>
          <Text variant="sub" tone="secondary" align="center" style={styles.caption}>
            {done
              ? `${DEVICE_NAME} is registered and filtering. Nothing else to set up here.`
              : 'This takes a moment. You can leave the screen on.'}
          </Text>
        </View>
      )}

      <View style={[styles.footnote, { gap: theme.spacing.sm, marginTop: theme.spacing['2xl'] }]}>
        <Icon name="eye-off-outline" size={14} color={theme.colors.textMuted} />
        <Text variant="caption" tone="muted" style={styles.flex}>
          Aegis never sees which sites you visit. The blocklist is matched on the device.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  steps: { width: '100%' },
  progress: { alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 6, maxWidth: 300 },
  footnote: { flexDirection: 'row', alignItems: 'flex-start' },
});
