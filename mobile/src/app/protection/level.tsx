import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  OptionCard,
  Screen,
  StrengthMeter,
  Text,
} from '@/components/ui';
import { describeWaitingPeriod } from '@/lib/format';
import { useActivePartner, useAppDispatch, useAppState, useIsPremium } from '@/store/app-store';
import { useTheme } from '@/theme';
import { PROTECTION_LEVELS, type ProtectionLevelId } from '@/types';

export default function ProtectionLevelScreen() {
  const theme = useTheme();
  const router = useRouter();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const partner = useActivePartner();
  const isPremium = useIsPremium();

  const current = state.lock.level;
  const [selected, setSelected] = useState<ProtectionLevelId>(current);

  const changed = selected !== current;
  // Raising the lock is free. Lowering a strong lock has to pass through the
  // lock itself, or the lock would be worth nothing.
  const guarded = changed && selected < current && (current === 3 || current === 4);

  const save = () => {
    if (guarded) {
      router.push(`/protection/disable?intent=lower-level&to=${selected}`);
      return;
    }
    dispatch({ type: 'set-level', level: selected });
    router.back();
  };

  return (
    <Screen
      header={<Header title="Protection level" large />}
      footer={
        <Button
          label={guarded ? 'Continue to unlock' : 'Save level'}
          icon={guarded ? 'lock-closed' : undefined}
          disabled={!changed}
          onPress={save}
        />
      }>
      <Text variant="body" tone="secondary">
        This sets how hard it is to turn protection off. It doesn’t change what gets blocked —
        that’s the list on the Protection tab.
      </Text>

      <Text variant="sub" tone="muted" style={{ marginTop: theme.spacing.sm }}>
        Moving up a level takes effect straight away. Moving down from a waiting period or
        partner approval has to go through that lock first.
      </Text>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
        {PROTECTION_LEVELS.map((level) => {
          const isSelected = selected === level.id;
          const locked = level.strength >= 3 && !isPremium;
          const partnerMissing = level.id === 4 && state.lock.partnerId === null;

          return (
            <OptionCard
              key={level.id}
              title={`Level ${level.id} · ${level.name}`}
              description={level.tagline}
              selected={isSelected}
              locked={locked}
              indicator="radio"
              onPress={() => {
                if (locked) {
                  router.push('/subscription');
                  return;
                }
                setSelected(level.id);
              }}>
              <View style={{ gap: theme.spacing.md }}>
                <StrengthMeter value={level.strength} />

                {locked ? <Badge label="Premium" tone="brand" icon="lock-closed" /> : null}

                {isSelected ? (
                  <Text variant="sub" tone="secondary">
                    {level.description}
                  </Text>
                ) : null}

                {isSelected && level.method === 'delay' ? (
                  <Text variant="caption" tone="muted">
                    Currently set to {describeWaitingPeriod(state.lock.waitingPeriodMinutes)}. You
                    can change that in Lock settings.
                  </Text>
                ) : null}

                {isSelected && level.method === 'partner' && !partnerMissing && partner ? (
                  <Text variant="caption" tone="muted">
                    {partner.name} would approve your requests. They never see your browsing
                    history.
                  </Text>
                ) : null}

                {isSelected && partnerMissing ? (
                  <View
                    style={[
                      styles.note,
                      {
                        backgroundColor: theme.colors.warnSoft,
                        borderRadius: theme.radius.md,
                        padding: theme.spacing.md,
                        gap: theme.spacing.sm,
                      },
                    ]}>
                    <Text variant="caption" tone="warn">
                      This level needs someone to approve your requests. Until you choose a
                      partner, there’s nobody to ask.
                    </Text>
                    <Button
                      label="Choose partner"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onPress={() => router.push('/(tabs)/accountability')}
                    />
                  </View>
                ) : null}
              </View>
            </OptionCard>
          );
        })}
      </View>

      {guarded ? (
        <Card
          padding="base"
          style={{ marginTop: theme.spacing.lg, backgroundColor: theme.colors.warnSoft }}>
          <View style={[styles.row, { gap: theme.spacing.md }]}>
            <Icon name="lock-closed" size={18} color={theme.colors.warn} />
            <Text variant="sub" tone="secondary" style={styles.flex}>
              {current === 3
                ? `Lowering your lock starts the same ${describeWaitingPeriod(state.lock.waitingPeriodMinutes)} waiting period as turning protection off. Protection stays exactly as it is until then.`
                : `Lowering your lock needs ${partner ? partner.name : 'your partner'} to approve it, the same as turning protection off. Nothing changes until they do.`}
            </Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
