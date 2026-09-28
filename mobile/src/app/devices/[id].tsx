import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlatformChip } from '@/components/devices/platform-chip';
import { statusBadge, statusDetail } from '@/components/devices/status';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Sparkline,
  Text,
  Toggle,
} from '@/components/ui';
import { platformLabel, plural, relativeTime, weekdayLabels } from '@/lib/format';
import { useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';

export default function DeviceDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { devices } = useAppState();
  const dispatch = useAppDispatch();

  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const removeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (removeTimer.current) clearTimeout(removeTimer.current);
    },
    [],
  );

  const device = devices.find((candidate) => candidate.id === id) ?? null;

  if (!device) {
    return (
      <Screen header={<Header title="Device" />}>
        <EmptyState
          icon="help-circle-outline"
          title="Device not found"
          description="This device is no longer on your account. It may have been removed from another device."
          action={{ label: 'Back to devices', onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const badge = statusBadge(device.status);
  const weekTotal = device.weeklyBlocks.reduce((total, value) => total + value, 0);
  const isProtected = device.status === 'protected';

  const tint = isProtected
    ? theme.colors.shield
    : device.status === 'offline'
      ? theme.colors.brand
      : theme.colors.warn;

  const handleRemove = () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      removeTimer.current = setTimeout(() => setConfirmingRemove(false), 4000);
      return;
    }

    if (removeTimer.current) clearTimeout(removeTimer.current);
    dispatch({ type: 'remove-device', id: device.id });
    router.back();
  };

  return (
    <Screen header={<Header title={device.name} />}>
      {device.status === 'needs-setup' ? (
        <Card style={{ backgroundColor: theme.colors.warnSoft }}>
          <View style={[styles.setupRow, { gap: theme.spacing.md }]}>
            <Icon name="alert-circle" size={22} color={theme.colors.warn} />
            <View style={styles.setupText}>
              <Text variant="bodyStrong">One step left</Text>
              <Text variant="sub" tone="secondary" style={{ marginTop: 4 }}>
                This device is registered but not filtering yet. Finish setup to cover it.
              </Text>
              <Button
                label="Finish setup"
                size="sm"
                fullWidth={false}
                onPress={() => dispatch({ type: 'set-device-status', id: device.id, status: 'protected' })}
                style={{ marginTop: theme.spacing.md }}
              />
            </View>
          </View>
        </Card>
      ) : null}

      <View style={{ marginTop: device.status === 'needs-setup' ? theme.spacing.md : 0 }}>
        <Card>
          <View style={[styles.hero, { gap: theme.spacing.md }]}>
            <PlatformChip platform={device.platform} size={72} tint={tint} />

            <Text variant="h2" align="center" numberOfLines={2}>
              {device.name}
            </Text>

            <View style={[styles.heroBadges, { gap: theme.spacing.sm }]}>
              <Badge label={badge.label} tone={badge.tone} icon={badge.icon} />
              {device.isCurrent ? <Badge label="This device" tone="brand" /> : null}
            </View>

            <Text variant="caption" tone="muted" align="center">
              {`${platformLabel(device.platform)} · seen ${relativeTime(device.lastSeen).toLowerCase()}`}
            </Text>
          </View>
        </Card>
      </View>

      <Section title="Activity">
        <Card>
          <Sparkline data={device.weeklyBlocks} labels={weekdayLabels()} color={tint} />
          <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.md }}>
            {weekTotal === 0
              ? 'Nothing was blocked on this device in the last 7 days.'
              : `${plural(weekTotal, 'attempt')} blocked here in the last 7 days.`}
          </Text>
        </Card>
      </Section>

      <Section title="Protection">
        <Card padding="none">
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              title={isProtected ? 'Protection is on' : 'Protection is off'}
              subtitle={statusDetail(device.status)}
              icon="shield-checkmark"
              iconColor={isProtected ? theme.colors.shield : theme.colors.warn}
              chevron={false}
              trailing={
                <Toggle
                  value={isProtected}
                  accessibilityLabel={`Protection on ${device.name}`}
                  onValueChange={(next) =>
                    dispatch({
                      type: 'set-device-status',
                      id: device.id,
                      status: next ? 'protected' : 'paused',
                    })
                  }
                />
              }
              divider
            />

            <ListRow
              title="Filtering"
              subtitle="DNS-level, so it covers every browser and app on this device."
              icon="globe-outline"
              iconColor={theme.colors.brand}
              chevron={false}
            />
          </View>
        </Card>
      </Section>

      <Section>
        <Button
          label={confirmingRemove ? 'Tap again to remove' : 'Remove device'}
          variant="danger"
          icon={confirmingRemove ? 'alert-circle-outline' : 'trash-outline'}
          onPress={handleRemove}
        />
        <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.md }}>
          Removing it stops filtering there. You can add it back any time.
        </Text>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  setupRow: { flexDirection: 'row', alignItems: 'flex-start' },
  setupText: { flex: 1 },
  hero: { alignItems: 'center' },
  heroBadges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
