import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RequestCard } from '@/components/accountability';
import {
  Card,
  EmptyState,
  Header,
  Screen,
  Section,
  Segmented,
  Text,
  type SegmentedOption,
} from '@/components/ui';
import { useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';

type Filter = 'pending' | 'resolved';

const FILTERS: readonly SegmentedOption<Filter>[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

const STEPS: readonly string[] = [
  'You ask to turn protection off, and say why in your own words.',
  'A waiting period starts, or your partner is asked to approve.',
  'Protection stays on the whole time — and you can cancel at any point.',
];

export default function RequestsScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { requests, partners } = useAppState();

  const [filter, setFilter] = useState<Filter>('pending');
  const [now, setNow] = useState(() => Date.now());

  const visible = useMemo(
    () =>
      requests.filter((request) =>
        filter === 'pending' ? request.status === 'pending' : request.status !== 'pending',
      ),
    [requests, filter],
  );

  // One timer for the whole screen, and only while a countdown is actually running.
  const ticking = requests.some((r) => r.status === 'pending' && r.method === 'delay');

  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  return (
    <Screen
      header={
        <Header
          title="Requests"
          large
          subtitle="Every time you have asked to turn protection off, and what happened next."
        />
      }>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      {visible.length > 0 ? (
        <Section gap={theme.spacing.lg}>
          <View style={{ gap: theme.spacing.md }}>
            {visible.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                partnerName={partners.find((p) => p.id === request.partnerId)?.name ?? null}
                now={now}
                onCancel={() =>
                  dispatch({ type: 'resolve-request', id: request.id, status: 'cancelled' })
                }
              />
            ))}
          </View>
        </Section>
      ) : filter === 'pending' ? (
        <Section gap={theme.spacing.sm}>
          <EmptyState
            icon="checkmark-circle-outline"
            title="Nothing waiting"
            description="No request to turn protection off is open. This screen being empty is the good outcome — it means the barrier is simply doing its job."
          />

          <Card variant="outlined">
            <Text variant="label" tone="muted">
              If you ever do ask
            </Text>

            <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
              {STEPS.map((step, index) => (
                <View key={step} style={[styles.step, { gap: theme.spacing.md }]}>
                  <View
                    style={[
                      styles.number,
                      {
                        backgroundColor: theme.colors.brandSoft,
                        borderRadius: theme.radius.full,
                      },
                    ]}>
                    <Text variant="caption" tone="brand">
                      {index + 1}
                    </Text>
                  </View>
                  <Text variant="sub" tone="secondary" style={styles.flex}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Section>
      ) : (
        <Section gap={theme.spacing.sm}>
          <EmptyState
            icon="archive-outline"
            title="No past requests"
            description="Approved, declined and cancelled requests are kept here as a record — one only you and the partner involved can see."
          />
        </Section>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'flex-start' },
  number: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
