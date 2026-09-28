import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, Text } from '@/components/ui';
import { themes, useTheme } from '@/theme';
import type { BillingPeriod, Plan } from '@/types';

export type PlanCardProps = {
  plan: Plan;
  period: BillingPeriod;
  /** The dominant card: filled with the brand gradient and badged. */
  recommended?: boolean;
  /** This is the plan the account is on right now. */
  current: boolean;
  selected: boolean;
  /** Labels the free plan does not include — drawn heavier, they are the pitch. */
  premiumLabels: ReadonlySet<string>;
  onSelect: () => void;
};

function priceLabel(plan: Plan, period: BillingPeriod): { amount: string; suffix: string } {
  const amount = period === 'yearly' ? plan.priceYearly : plan.priceMonthly;
  if (amount === 0) return { amount: 'Free', suffix: 'forever' };
  return {
    amount: `$${amount.toFixed(2)}`,
    suffix: period === 'yearly' ? '/year' : '/month',
  };
}

export function PlanCard({
  plan,
  period,
  recommended = false,
  current,
  selected,
  premiumLabels,
  onSelect,
}: PlanCardProps) {
  const theme = useTheme();

  // The gradient card is dark in both schemes, so its contents always take the
  // dark scheme's tokens rather than the active one's.
  const ink = recommended ? themes.dark.colors : theme.colors;
  const { amount, suffix } = priceLabel(plan, period);

  return (
    <Card
      variant={recommended ? 'raised' : 'outlined'}
      padding="lg"
      gradient={recommended ? theme.colors.brandGradient : undefined}
      onPress={onSelect}
      style={[
        styles.card,
        {
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
          borderColor: selected ? theme.colors.brandStrong : theme.colors.border,
        },
      ]}>
      <View style={styles.badges}>
        {recommended ? <Badge label="Recommended" tone="shield" /> : null}
        {current ? <Badge label="Current plan" tone={recommended ? 'neutral' : 'brand'} /> : null}
      </View>

      <Text variant="h3" style={{ color: ink.text, marginTop: theme.spacing.md }}>
        {plan.name}
      </Text>
      <Text variant="sub" style={{ color: ink.textSecondary, marginTop: 2 }}>
        {plan.tagline}
      </Text>

      <View style={[styles.price, { marginTop: theme.spacing.base }]}>
        <Text variant="display" rounded style={{ color: ink.text }}>
          {amount}
        </Text>
        <Text variant="sub" style={{ color: ink.textSecondary, paddingBottom: 6 }}>
          {suffix}
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.base, gap: theme.spacing.sm }}>
        {plan.features.map((feature) => {
          const isPremiumOnly = premiumLabels.has(feature.label);
          return (
            <View key={feature.label} style={[styles.feature, { gap: theme.spacing.sm }]}>
              <Icon
                name={feature.included ? 'checkmark-circle' : 'remove-outline'}
                size={17}
                color={feature.included ? ink.shieldStrong : ink.textMuted}
              />
              <Text
                variant={feature.included && isPremiumOnly ? 'bodyStrong' : 'sub'}
                style={[
                  styles.featureLabel,
                  { color: feature.included ? ink.text : ink.textMuted },
                ]}>
                {feature.label}
              </Text>
            </View>
          );
        })}
      </View>

      <Button
        label={current ? 'Current plan' : `Choose ${plan.name}`}
        onPress={onSelect}
        disabled={current}
        variant={recommended ? 'secondary' : selected ? 'primary' : 'ghost'}
        size="sm"
        style={{ marginTop: theme.spacing.lg }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  // flexBasis lets two cards sit side by side on a wide screen and wrap on a
  // narrow one, without measuring the window.
  card: { flexGrow: 1, flexShrink: 1, flexBasis: 232, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, minHeight: 4 },
  price: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  feature: { flexDirection: 'row', alignItems: 'flex-start' },
  featureLabel: { flex: 1 },
});
