import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { firstParam } from '@/components/onboarding';
import {
  Badge,
  Button,
  Header,
  Icon,
  OptionCard,
  Screen,
  Stepper,
  Text,
} from '@/components/ui';
import { PROTECTION_CATEGORIES } from '@/data/seed';
import { useIsPremium } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { ProtectionCategoryId } from '@/types';

const DEFAULT_ON: ProtectionCategoryId[] = ['adult-websites', 'adult-apps'];

export default function ChooseProtectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string; email?: string }>();
  const isPremium = useIsPremium();

  const [selected, setSelected] = useState<ProtectionCategoryId[]>(DEFAULT_ON);
  const [premiumNote, setPremiumNote] = useState<ProtectionCategoryId | null>(null);

  const toggle = (id: ProtectionCategoryId) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const next = () =>
    router.push({
      pathname: '/(onboarding)/register-device',
      params: {
        name: firstParam(params.name, ''),
        email: firstParam(params.email, ''),
        categories: selected.join(','),
      },
    });

  return (
    <Screen
      header={
        <Header
          large
          title="What should we block?"
          subtitle="Start with the two that matter most. Every one of these is yours to change later."
          right={<Stepper current={2} total={4} />}
        />
      }
      footer={
        <Button label="Continue" size="lg" disabled={selected.length === 0} onPress={next} />
      }>
      <View style={[styles.list, { gap: theme.spacing.md, marginTop: theme.spacing.base }]}>
        {PROTECTION_CATEGORIES.map((category) => {
          const locked = category.premium && !isPremium;
          const showNote = premiumNote === category.id;

          return (
            <OptionCard
              key={category.id}
              title={category.title}
              description={category.description}
              icon={category.icon}
              indicator="check"
              locked={locked}
              selected={!locked && selected.includes(category.id)}
              onPress={() => {
                if (locked) {
                  setPremiumNote(showNote ? null : category.id);
                  return;
                }
                toggle(category.id);
              }}>
              {locked ? (
                <View style={[styles.locked, { gap: theme.spacing.sm }]}>
                  <Badge label="Premium" tone="brand" icon="sparkles-outline" />
                  {showNote ? (
                    <Text variant="caption" tone="secondary">
                      Included in Premium. Your free plan still blocks adult sites and apps —
                      you can add this from Protection whenever you like.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </OptionCard>
          );
        })}
      </View>

      <View style={[styles.footnote, { gap: theme.spacing.sm, marginTop: theme.spacing.lg }]}>
        <Icon name="lock-closed-outline" size={14} color={theme.colors.textMuted} />
        <Text variant="caption" tone="muted" style={styles.flex}>
          Filtering happens on the device. Aegis never sees the pages you open.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%' },
  locked: { alignItems: 'flex-start' },
  footnote: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
