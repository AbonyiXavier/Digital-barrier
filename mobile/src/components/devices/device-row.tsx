import { StyleSheet, View } from 'react-native';

import { Badge, Card, Icon, Text } from '@/components/ui';
import { PlatformChip } from '@/components/devices/platform-chip';
import { statusBadge } from '@/components/devices/status';
import { platformLabel, relativeTime } from '@/lib/format';
import { useTheme } from '@/theme';
import type { Device } from '@/types';

export type DeviceRowProps = {
  device: Device;
  onPress: () => void;
};

/** One device in the list: platform chip, name, status, chevron. */
export function DeviceRow({ device, onPress }: DeviceRowProps) {
  const theme = useTheme();
  const badge = statusBadge(device.status);

  const tint =
    device.status === 'protected'
      ? theme.colors.shield
      : device.status === 'needs-setup' || device.status === 'paused'
        ? theme.colors.warn
        : theme.colors.brand;

  return (
    <Card onPress={onPress}>
      <View style={[styles.row, { gap: theme.spacing.md }]}>
        <PlatformChip platform={device.platform} tint={tint} />

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {device.name}
          </Text>

          <View style={[styles.meta, { marginTop: 6, gap: theme.spacing.sm }]}>
            <Badge label={badge.label} tone={badge.tone} icon={badge.icon} />
            {device.isCurrent ? <Badge label="This device" tone="brand" /> : null}
            <Text variant="caption" tone="muted">
              {`${platformLabel(device.platform)} · ${relativeTime(device.lastSeen).toLowerCase()}`}
            </Text>
          </View>
        </View>

        <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
