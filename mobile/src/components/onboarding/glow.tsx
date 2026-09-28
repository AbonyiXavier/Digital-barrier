import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui';
import { useTheme } from '@/theme';

/** Which accent the onboarding artwork leans on: brand indigo or shield mint. */
export type GlowTone = 'brand' | 'shield';

const RINGS = [1, 0.8, 0.62, 0.46, 0.3] as const;

/**
 * React Native has no radial gradient, so concentric translucent discs stand in
 * for one. Five stacked layers give a falloff soft enough to read as a glow.
 */
export function SoftGlow({ size, tone = 'brand' }: { size: number; tone?: GlowTone }) {
  const theme = useTheme();
  const color = tone === 'shield' ? theme.colors.glow : theme.colors.brandSoft;

  return (
    <View pointerEvents="none" style={[styles.center, { width: size, height: size }]}>
      {RINGS.map((scale) => (
        <View
          key={scale}
          style={{
            position: 'absolute',
            width: size * scale,
            height: size * scale,
            borderRadius: size,
            backgroundColor: color,
            opacity: theme.isDark ? 0.5 : 0.36,
          }}
        />
      ))}
    </View>
  );
}

/** Full-bleed wash for `<Screen backdrop>`. Fades out before the footer. */
export function OnboardingBackdrop({ tone = 'brand' }: { tone?: GlowTone }) {
  const theme = useTheme();
  const gradient = tone === 'shield' ? theme.colors.shieldGradient : theme.colors.brandGradient;
  const stops: readonly [string, string, string] = [gradient[0], gradient[1], 'transparent'];
  const locations: readonly [number, number, number] = [0, 0.38, 1];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={stops}
        locations={locations}
        start={{ x: 0.12, y: 0 }}
        end={{ x: 0.88, y: 0.72 }}
        style={[StyleSheet.absoluteFill, { opacity: theme.isDark ? 0.32 : 0.15 }]}
      />
    </View>
  );
}

/** The app's shield mark: a gradient squircle floating on its own glow. */
export function ShieldMark({ size = 104, tone = 'brand' }: { size?: number; tone?: GlowTone }) {
  const theme = useTheme();
  const gradient = tone === 'shield' ? theme.colors.shieldGradient : theme.colors.brandGradient;
  const box = size * 2.2;

  return (
    <View style={[styles.center, { width: box, height: box }]}>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <SoftGlow size={box} tone={tone} />
      </View>

      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.center,
          theme.shadows.lg,
          { width: size, height: size, borderRadius: size * 0.32 },
        ]}>
        <Icon name="shield-checkmark" size={size * 0.46} color={theme.colors.textOnAccent} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
