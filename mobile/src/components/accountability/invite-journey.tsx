import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Avatar, Card, Divider, Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

type Benefit = { icon: IconName; text: string };

const BENEFITS: readonly Benefit[] = [
  {
    icon: 'person-outline',
    text: 'You choose who it is — a spouse, a friend, a sibling, a parent, a mentor.',
  },
  {
    icon: 'notifications-outline',
    text: 'They are told when you ask to turn protection off, and nothing else.',
  },
  {
    icon: 'eye-off-outline',
    text: 'They never see the sites you visit. Not now, not later, not ever.',
  },
];

const DOTS = [0, 1, 2, 3] as const;

/**
 * The "why would I want this" panel: you, an invitation, and one person on the
 * other end. Shown only while accountability is off — encouragement, not a nag.
 */
export function InviteJourney({ initials }: { initials: string }) {
  const theme = useTheme();

  return (
    <Card padding="none" variant="outlined">
      <View style={{ padding: theme.spacing.lg }}>
        <LinearGradient
          colors={[theme.colors.brandSoft, theme.colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <View style={[styles.node, { gap: theme.spacing.sm }]}>
            <Avatar initials={initials} size={54} />
            <Text variant="micro" tone="secondary" align="center">
              You
            </Text>
          </View>

          <View style={styles.link}>
            <View
              style={[
                styles.pill,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.full,
                },
              ]}>
              <Icon name="paper-plane-outline" size={11} color={theme.colors.brand} />
              <Text variant="micro" tone="brand">
                invites
              </Text>
            </View>

            <View style={styles.dots}>
              {DOTS.map((dot) => (
                <View
                  key={dot}
                  style={[styles.dot, { backgroundColor: theme.colors.borderStrong }]}
                />
              ))}
              <Icon name="chevron-forward" size={12} color={theme.colors.borderStrong} />
            </View>
          </View>

          <View style={[styles.node, { gap: theme.spacing.sm }]}>
            <View
              style={[
                styles.placeholder,
                {
                  borderColor: theme.colors.borderStrong,
                  backgroundColor: theme.colors.surfaceAlt,
                },
              ]}>
              <Icon name="person-add-outline" size={22} color={theme.colors.textMuted} />
            </View>
            <Text variant="micro" tone="secondary" align="center">
              Someone you trust
            </Text>
          </View>
        </View>
      </View>

      <Divider />

      <View style={{ padding: theme.spacing.base, gap: theme.spacing.md }}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.text} style={[styles.benefit, { gap: theme.spacing.md }]}>
            <View
              style={[
                styles.chip,
                { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.sm },
              ]}>
              <Icon name={benefit.icon} size={15} color={theme.colors.brand} />
            </View>
            <Text variant="sub" tone="secondary" style={styles.flex}>
              {benefit.text}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  node: { width: 82, alignItems: 'center' },
  // Nudged down so the connector lines up with the middle of the two circles.
  link: { flex: 1, alignItems: 'center', gap: 8, marginTop: 5 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  placeholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefit: { flexDirection: 'row', alignItems: 'flex-start' },
  chip: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
