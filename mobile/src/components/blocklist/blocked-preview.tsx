import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { themes, useTheme, type ThemeColors } from '@/theme';
import type { BlockedScreenConfig } from '@/types';

export type BlockedPreviewProps = {
  config: BlockedScreenConfig;
  /** The site someone tried to reach — shown as a mock URL chip. */
  domain: string;
  /** Null when nobody has been invited yet. */
  partnerName: string | null;
};

/** Slow, even, and impossible to rush — the point of the exercise. */
function BreathingCircle({ colors }: { colors: ThemeColors }) {
  // useState's lazy initialiser, not a ref: the compiler forbids reading a
  // ref during render, and this value must survive re-renders.
  const [scale] = useState(() => new Animated.Value(0.78));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.78, duration: 4000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(0.78);
    };
  }, [scale]);

  return (
    <View style={styles.breathe}>
      <View style={[styles.breatheTrack, { borderColor: colors.border }]}>
        <Animated.View
          style={[
            styles.breatheFill,
            { backgroundColor: colors.shieldSoft, borderColor: colors.shield },
            { transform: [{ scale }] },
          ]}
        />
      </View>
      <Text variant="micro" style={{ color: colors.textMuted, marginTop: 6 }} align="center">
        Breathe in… breathe out
      </Text>
    </View>
  );
}

export function BlockedPreview({ config, domain, partnerName }: BlockedPreviewProps) {
  const theme = useTheme();

  // The bold theme is a dark page in either scheme, so its contents read from
  // the dark tokens regardless of what the phone is set to.
  const ink: ThemeColors = config.theme === 'bold' ? themes.dark.colors : theme.colors;
  const ground =
    config.theme === 'bold'
      ? themes.dark.colors.background
      : config.theme === 'calm'
        ? theme.colors.surface
        : theme.colors.background;

  const partnerLabel = `Message ${partnerName ?? 'your partner'}`;

  return (
    <View style={[styles.shadow, theme.shadows.lg]}>
      <View
        style={[
          styles.frame,
          {
            borderColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.xl,
            backgroundColor: ground,
          },
        ]}>
        {config.theme === 'calm' ? (
          <LinearGradient
            colors={[theme.colors.shieldSoft, theme.colors.brandSoft, ground] as const}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        <View style={styles.page}>
          <View
            style={[
              styles.urlChip,
              {
                backgroundColor: config.theme === 'bold' ? ink.surface : ink.surfaceAlt,
                borderRadius: theme.radius.full,
              },
            ]}>
            <Icon name="lock-closed" size={9} color={ink.textMuted} />
            <Text variant="micro" numberOfLines={1} style={{ color: ink.textMuted, flexShrink: 1 }}>
              {domain}
            </Text>
          </View>

          <View
            style={[
              styles.body,
              config.theme === 'minimal' ? styles.bodyMinimal : null,
            ]}>
            {config.theme === 'calm' ? (
              <View
                style={[
                  styles.calmMark,
                  { backgroundColor: ink.shieldSoft, borderRadius: theme.radius.full },
                ]}>
                <Icon name="shield-checkmark" size={22} color={ink.shield} />
              </View>
            ) : null}

            {config.theme === 'bold' ? (
              <LinearGradient
                colors={theme.colors.brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.boldBar, { borderRadius: theme.radius.full }]}
              />
            ) : null}

            {config.theme === 'minimal' ? (
              <Icon name="shield-outline" size={16} color={ink.textMuted} />
            ) : null}

            <Text
              variant={config.theme === 'bold' ? 'h2' : config.theme === 'calm' ? 'h3' : 'bodyStrong'}
              rounded={config.theme !== 'minimal'}
              align="center"
              style={{ color: ink.text, marginTop: config.theme === 'minimal' ? 14 : 10 }}>
              {config.headline}
            </Text>

            <Text
              variant={config.theme === 'minimal' ? 'micro' : 'caption'}
              align="center"
              style={{
                color: config.theme === 'minimal' ? ink.textMuted : ink.textSecondary,
                marginTop: 8,
              }}>
              {config.message}
            </Text>

            {config.showBreathingExercise ? <BreathingCircle colors={ink} /> : null}
          </View>

          {config.showPartnerButton ? (
            <View
              style={[
                styles.partnerButton,
                {
                  backgroundColor: config.theme === 'bold' ? ink.brand : ink.surfaceAlt,
                  borderRadius: theme.radius.full,
                },
              ]}>
              <Icon
                name="chatbubble-ellipses-outline"
                size={11}
                color={config.theme === 'bold' ? ink.textOnAccent : ink.text}
              />
              <Text
                variant="micro"
                numberOfLines={1}
                style={{ color: config.theme === 'bold' ? ink.textOnAccent : ink.text }}>
                {partnerLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { alignSelf: 'center', width: '100%', maxWidth: 236 },
  frame: { width: '100%', aspectRatio: 9 / 16, borderWidth: 9, overflow: 'hidden' },
  page: { flex: 1, padding: 12, alignItems: 'center' },
  urlChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bodyMinimal: { paddingHorizontal: 14 },
  calmMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  boldBar: { width: 40, height: 4 },
  breathe: { alignItems: 'center', marginTop: 16 },
  breatheTrack: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breatheFill: { width: 54, height: 54, borderRadius: 27, borderWidth: 1 },
  partnerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
});
