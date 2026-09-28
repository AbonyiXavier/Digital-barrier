import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

/** One line of the welcome screen's value proposition. */
export function ValuePoint({ icon, label }: { icon: IconName; label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <View
        style={[
          styles.chip,
          { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.full },
        ]}>
        <Icon name={icon} size={16} color={theme.colors.brand} />
      </View>
      <Text variant="sub" tone="secondary" style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

/** A step in the "what happens next" explainer: a numbered chip, not a checkbox. */
export function NumberedStep({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.rowTop, { gap: theme.spacing.md }]}>
      <View
        style={[
          styles.chip,
          { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.full },
        ]}>
        <Text variant="caption" tone="brand" rounded>
          {index}
        </Text>
      </View>

      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="sub" tone="secondary" style={{ marginTop: 2 }}>
          {description}
        </Text>
      </View>
    </View>
  );
}

/** Label on the left, value on the right — the setup preview on the last step. */
export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.summary, { gap: theme.spacing.base }]}>
      <Text variant="sub" tone="secondary">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text variant="sub" weight={theme.fontWeight.semibold} align="right" style={styles.flex}>
          {value}
        </Text>
      ) : (
        <View style={styles.value}>{value}</View>
      )}
    </View>
  );
}

/** A rule with a word sitting in the gap. */
export function LabelledDivider({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  chip: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { alignItems: 'flex-end' },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
