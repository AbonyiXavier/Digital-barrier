import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FaqAccordion, type FaqItem } from '@/components/subscription/faq-accordion';
import { PlanCard } from '@/components/subscription/plan-card';
import { Badge, Button, Card, Header, Screen, Section, Segmented, Text } from '@/components/ui';
import { PLANS } from '@/data/seed';
import { useAppDispatch, useAppState, useIsPremium } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { BillingPeriod, PlanId } from '@/types';

const PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
] as const satisfies readonly { value: BillingPeriod; label: string }[];

const FAQ: readonly FaqItem[] = [
  {
    question: 'What happens if I cancel?',
    answer:
      'Premium runs to the end of the period you have already paid for, then the account drops to Free. Your blocklist, your PIN and your rules stay exactly as they are. Nothing is deleted, and protection is never switched off on your behalf.',
  },
  {
    question: 'Does this work on my computer?',
    answer:
      'Yes. Premium covers unlimited devices, so your Mac, Windows PC, iPhone and Android all sit behind the same account and the same Protection Lock. Add one from the Devices tab and it inherits these settings.',
  },
  {
    question: 'Can my partner see what I browse?',
    answer:
      'No, never. An accountability partner sees that you asked to turn protection off, and approves or declines that request. They see no history, no site names and no blocked attempts — not on Free, not on Premium.',
  },
];

const dateFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export default function SubscriptionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { subscription } = useAppState();
  const dispatch = useAppDispatch();
  const isPremium = useIsPremium();

  const [period, setPeriod] = useState<BillingPeriod>(subscription.period);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('premium');
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    },
    [],
  );

  const free = PLANS.find((plan) => plan.id === 'free');
  const premium = PLANS.find((plan) => plan.id === 'premium');

  /** Labels Premium includes and Free does not — the reason to upgrade. */
  const premiumLabels = useMemo(() => {
    const freeIncluded = new Set(
      (free?.features ?? []).filter((f) => f.included).map((f) => f.label),
    );
    return new Set(
      (premium?.features ?? [])
        .filter((f) => f.included && !freeIncluded.has(f.label))
        .map((f) => f.label),
    );
  }, [free, premium]);

  const yearlySaving = useMemo(() => {
    if (!premium || premium.priceMonthly <= 0) return 0;
    return Math.round((1 - premium.priceYearly / (premium.priceMonthly * 12)) * 100);
  }, [premium]);

  const unchanged = selectedPlan === subscription.plan && period === subscription.period;

  const actionLabel = unchanged
    ? 'Current plan'
    : selectedPlan === 'free'
      ? 'Switch to Free'
      : isPremium
        ? period === 'yearly'
          ? 'Switch to yearly'
          : 'Switch to monthly'
        : 'Start Premium';

  const showNote = (message: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(message);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };

  const confirm = () => {
    dispatch({ type: 'set-plan', plan: selectedPlan, period });
    router.back();
  };

  return (
    <Screen
      header={<Header title="Choose your plan" onBack={() => router.back()} />}
      footer={
        <View style={{ gap: theme.spacing.md }}>
          <Button label={actionLabel} onPress={confirm} disabled={unchanged} />
          <Text variant="micro" tone="muted" align="center">
            Cancel any time, from this screen or your app store account.
          </Text>
          <Text variant="micro" tone="muted" align="center">
            Cancelling never silently turns protection off. Your blocklist and your Protection
            Lock keep running — switching protection off is always a decision you make yourself.
          </Text>
        </View>
      }>
      <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
        Free protection is real protection — the same blocklist, the same filtering, on this
        device, for as long as you want it. Premium adds the locks that hold when it counts.
      </Text>

      <View style={[styles.periodRow, { marginTop: theme.spacing.lg, gap: theme.spacing.md }]}>
        <View style={styles.grow}>
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        </View>
        {yearlySaving > 0 ? <Badge label={`Save ${yearlySaving}%`} tone="shield" /> : null}
      </View>

      <View style={[styles.plans, { marginTop: theme.spacing.lg, gap: theme.spacing.md }]}>
        {premium ? (
          <PlanCard
            plan={premium}
            period={period}
            recommended
            current={subscription.plan === 'premium'}
            selected={selectedPlan === 'premium'}
            premiumLabels={premiumLabels}
            onSelect={() => setSelectedPlan('premium')}
          />
        ) : null}
        {free ? (
          <PlanCard
            plan={free}
            period={period}
            current={subscription.plan === 'free'}
            selected={selectedPlan === 'free'}
            premiumLabels={premiumLabels}
            onSelect={() => setSelectedPlan('free')}
          />
        ) : null}
      </View>

      {isPremium ? (
        <Section title="Your subscription">
          <Card>
            <Text variant="bodyStrong">
              {subscription.period === 'yearly' ? 'Premium, billed yearly' : 'Premium, billed monthly'}
            </Text>
            <Text variant="sub" tone="secondary" style={{ marginTop: 4 }}>
              {subscription.renewsAt
                ? `Renews on ${new Date(subscription.renewsAt).toLocaleDateString(undefined, dateFormat)}`
                : 'Renews automatically'}
            </Text>

            <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.base }}>
              <Button
                label="Manage billing"
                variant="secondary"
                size="sm"
                onPress={() => showNote('Billing opens in your app store account in the real app.')}
              />
              <Button
                label="Switch to Free"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setSelectedPlan('free');
                  showNote('Free selected. Confirm below — protection stays on either way.');
                }}
              />
            </View>

            {note ? (
              <Text variant="caption" tone="brand" style={{ marginTop: theme.spacing.md }}>
                {note}
              </Text>
            ) : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Questions">
        <FaqAccordion items={FAQ} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  plans: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
});
