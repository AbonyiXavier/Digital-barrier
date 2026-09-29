import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, ProgressRing, Text } from '@/components/ui';
import { coverageOf, useFilter } from '@/lib/filter';
import { countdown, elapsedFraction, plural } from '@/lib/format';
import {
  useAppDispatch,
  useAppState,
  usePendingRequest,
  useProtectedDays,
} from '@/store/app-store';
import { useTheme } from '@/theme';

const RING_SIZE = 232;
const RING_THICKNESS = 16;

/**
 * The emotional centre of the app. Four states, in priority order: a pending
 * request to disable (a countdown), a coverage gap, protection on, protection
 * off.
 *
 * The gap state was added because the other three read only the account's
 * intent. On a phone that has not been granted VPN consent — or whose tunnel
 * another VPN has taken — that showed a full green ring reading "Protected" to
 * someone whose traffic was entirely unfiltered.
 */
export function ProtectionHero() {
  const theme = useTheme();
  const { colors } = theme;
  const dispatch = useAppDispatch();
  const router = useRouter();
  const filter = useFilter();
  const { protectionOn, partners } = useAppState();
  const pending = usePendingRequest();
  const days = useProtectedDays();
  const coverage = coverageOf(protectionOn, filter.state);

  const [now, setNow] = useState(() => Date.now());

  // Only a live countdown needs a ticking clock.
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pending]);

  const centerWidth = RING_SIZE - RING_THICKNESS * 2 - theme.spacing.lg;

  let progress: number;
  let ringColors: readonly [string, string];
  let glow: string;
  let center: ReactNode;
  let note: string | null = null;

  if (pending) {
    const partner = partners.find((p) => p.id === pending.partnerId) ?? null;

    progress = elapsedFraction(pending.requestedAt, pending.resolvesAt, now);
    ringColors = [colors.warn, colors.warn];
    glow = colors.warnSoft;
    note =
      pending.method === 'partner'
        ? `Waiting for ${partner ? partner.name : 'your partner'} to answer.`
        : 'Protection stays on until the countdown ends.';
    center = (
      <>
        <Icon name="hourglass-outline" size={24} color={colors.warn} />
        <Text variant="display" rounded numberOfLines={1} adjustsFontSizeToFit align="center">
          {countdown(pending.resolvesAt, now)}
        </Text>
        <Text variant="caption" tone="secondary" align="center">
          until protection can be turned off
        </Text>
      </>
    );
  } else if (coverage.kind === 'gap') {
    // Deliberately not a full ring. The account is protected, so this is not the
    // red "Not protected" state — but a complete ring is the one thing this
    // screen must not draw when nothing is being filtered.
    progress = 0.5;
    ringColors = [colors.warn, colors.warn];
    glow = colors.warnSoft;
    note = 'Protection is on, but this phone is not filtering.';
    center = (
      <>
        <Icon name="shield-half-outline" size={30} color={colors.warn} />
        <Text variant="h2" rounded align="center">
          Not filtering here
        </Text>
      </>
    );
  } else if (protectionOn) {
    progress = 1;
    ringColors = colors.shieldGradient;
    glow = colors.glow;
    center = (
      <>
        <Icon name="shield-checkmark" size={30} color={colors.shield} />
        <Text variant="display" rounded numberOfLines={1} adjustsFontSizeToFit align="center">
          Protected
        </Text>
        <Text variant="sub" tone="secondary" align="center">
          {`for ${plural(days, 'day')}`}
        </Text>
      </>
    );
  } else {
    progress = 0.15;
    ringColors = [colors.danger, colors.danger];
    glow = colors.dangerSoft;
    note = 'Nothing is being filtered right now.';
    center = (
      <>
        <Icon name="shield-outline" size={30} color={colors.danger} />
        <Text variant="h2" rounded align="center">
          Not protected
        </Text>
      </>
    );
  }

  return (
    <View style={[styles.wrap, { gap: theme.spacing.base }]}>
      <View style={styles.ringWrap}>
        <View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: RING_SIZE * 1.18,
              height: RING_SIZE * 1.18,
              borderRadius: RING_SIZE,
              backgroundColor: glow,
            },
          ]}
        />

        <ProgressRing
          progress={progress}
          size={RING_SIZE}
          thickness={RING_THICKNESS}
          colors={ringColors}
          trackColor={theme.colors.surfaceAlt}>
          <View style={[styles.center, { width: centerWidth, gap: theme.spacing.xs }]}>
            {center}
          </View>
        </ProgressRing>
      </View>

      {note ? (
        <Text variant="sub" tone="secondary" align="center">
          {note}
        </Text>
      ) : null}

      {coverage.kind === 'gap' ? (
        <Button
          label="Fix this"
          variant="secondary"
          icon="shield-half-outline"
          fullWidth={false}
          onPress={() => router.push('/(tabs)/protection')}
        />
      ) : !protectionOn && !pending ? (
        <Button
          label="Turn protection on"
          variant="shield"
          icon="shield-checkmark"
          fullWidth={false}
          onPress={() => dispatch({ type: 'set-protection', on: true })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', opacity: 0.75 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
