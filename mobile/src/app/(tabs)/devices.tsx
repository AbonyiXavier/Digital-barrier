import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { DeviceRow } from '@/components/devices/device-row';
import { TAB_BAR_CLEARANCE } from '@/components/navigation/tab-bar';
import {
  Button,
  Card,
  EmptyState,
  Header,
  Icon,
  Screen,
  Section,
  Text,
} from '@/components/ui';
import { plural } from '@/lib/format';
import { useAppState, useIsPremium } from '@/store/app-store';
import { useTheme } from '@/theme';

export default function DevicesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { devices } = useAppState();
  const isPremium = useIsPremium();

  const covered = devices.filter((device) => device.status === 'protected');
  const attention = devices.filter((device) => device.status !== 'protected');

  const subtitle =
    devices.length === 0
      ? 'No devices yet'
      : `${covered.length} of ${plural(devices.length, 'device')} protected`;

  return (
    <Screen
      bottomInset={TAB_BAR_CLEARANCE}
      header={
        <Header
          title="Devices"
          subtitle={subtitle}
          onBack={false}
          large
          right={
            <Button
              label="Add"
              icon="add"
              size="sm"
              fullWidth={false}
              onPress={() => router.push('/devices/add')}
              style={styles.addButton}
            />
          }
        />
      }>
      {devices.length === 0 ? (
        <EmptyState
          icon="phone-portrait-outline"
          title="No devices yet"
          description="Add the phone or computer you want covered and protection starts there too."
          action={{ label: 'Add a device', onPress: () => router.push('/devices/add') }}
        />
      ) : null}

      {covered.length > 0 ? (
        <Section title="Protected">
          <View style={{ gap: theme.spacing.md }}>
            {covered.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                onPress={() => router.push(`/devices/${device.id}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {attention.length > 0 ? (
        <Section title="Needs attention">
          <View style={{ gap: theme.spacing.md }}>
            {attention.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                onPress={() => router.push(`/devices/${device.id}`)}
              />
            ))}
          </View>
        </Section>
      ) : null}

      {!isPremium ? (
        <View style={{ marginTop: theme.spacing.xl }}>
          <Card variant="outlined" onPress={() => router.push('/subscription')}>
            <View style={[styles.footnote, { gap: theme.spacing.md }]}>
              <View style={styles.footnoteText}>
                <Text variant="sub" tone="secondary">
                  Free covers one device. Premium covers every device you sign in on — phone,
                  laptop, the computer in the study.
                </Text>
                <Text variant="caption" tone="brand" style={{ marginTop: 6 }}>
                  See what Premium adds
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </View>
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: { paddingHorizontal: 12 },
  footnote: { flexDirection: 'row', alignItems: 'center' },
  footnoteText: { flex: 1 },
});
