import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Header, Icon, OptionCard, Screen, Section, Text } from '@/components/ui';
import { platformIcon, platformLabel } from '@/lib/format';
import { useAppDispatch } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { Device, DevicePlatform } from '@/types';

const PLATFORMS: readonly DevicePlatform[] = ['ios', 'android', 'macos', 'windows'];

/** Ambiguous characters are left out — people read this code aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makePairingCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join('');
}

export default function AddDeviceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [platform, setPlatform] = useState<DevicePlatform | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One code per visit to this screen.
  const code = useMemo(() => makePairingCode(), []);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleCopy = () => {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleAdd = () => {
    if (!platform) return;

    const device: Device = {
      id: `d_${Date.now()}`,
      name: `New ${platformLabel(platform)}`,
      platform,
      status: 'protected',
      lastSeen: new Date().toISOString(),
      isCurrent: false,
      weeklyBlocks: [0, 0, 0, 0, 0, 0, 0],
    };

    dispatch({ type: 'add-device', device });
    router.back();
  };

  const rows = [PLATFORMS.slice(0, 2), PLATFORMS.slice(2)];

  return (
    <Screen
      header={<Header title="Add a device" onBack={() => router.back()} />}
      footer={
        platform ? (
          <Button label="I’ve entered the code" icon="checkmark" onPress={handleAdd} />
        ) : undefined
      }>
      <Text variant="h2">Which device are you adding?</Text>
      <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
        Protection runs on each device separately, so pick the one in front of you.
      </Text>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
        {rows.map((row, index) => (
          <View key={index} style={[styles.row, { gap: theme.spacing.md }]}>
            {row.map((item) => (
              <View key={item} style={styles.cell}>
                <OptionCard
                  title={platformLabel(item)}
                  icon={platformIcon(item)}
                  indicator="none"
                  selected={platform === item}
                  onPress={() => setPlatform(item)}
                />
              </View>
            ))}
          </View>
        ))}
      </View>

      {platform ? (
        <Section title="Pair it">
          <Card>
            <View style={styles.pairing}>
              <Text variant="label" tone="muted">
                Pairing code
              </Text>

              <Text
                variant="display"
                rounded
                align="center"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={[styles.code, { marginTop: theme.spacing.md }]}>
                {code}
              </Text>

              <Text
                variant="sub"
                tone="secondary"
                align="center"
                style={{ marginTop: theme.spacing.md }}>
                {`Open aegis.app/link on that ${platformLabel(platform)} and enter this code.`}
              </Text>

              <Button
                label={copied ? 'Copied' : 'Copy code'}
                icon={copied ? 'checkmark' : 'copy-outline'}
                variant="secondary"
                size="sm"
                fullWidth={false}
                onPress={handleCopy}
                style={{ marginTop: theme.spacing.base }}
              />
            </View>
          </Card>

          <Card variant="outlined" style={{ marginTop: theme.spacing.md }}>
            <View style={[styles.hint, { gap: theme.spacing.md }]}>
              <Icon name="information-circle-outline" size={20} color={theme.colors.textMuted} />
              <Text variant="caption" tone="secondary" style={styles.hintText}>
                The code stays valid while this screen is open. Nothing is shared with the new
                device except your protection settings.
              </Text>
            </View>
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  pairing: { alignItems: 'center' },
  code: { letterSpacing: 8 },
  hint: { flexDirection: 'row', alignItems: 'flex-start' },
  hintText: { flex: 1 },
});
