import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { OnboardingBackdrop, ShieldMark, ValuePoint } from '@/components/onboarding';
import { Button, Screen, Text } from '@/components/ui';
import { APP_NAME, APP_TAGLINE } from '@/lib/app';
import { useTheme } from '@/theme';

const POINTS = [
  { icon: 'globe-outline', label: 'Blocks adult sites on every browser' },
  { icon: 'lock-closed-outline', label: 'A lock only your calmer self can open' },
  { icon: 'people-outline', label: 'Someone you trust, if you want one' },
] as const;

export default function WelcomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const start = () => router.push('/(onboarding)/create-account');
  const signIn = () => router.push('/(onboarding)/sign-in');

  return (
    <Screen
      backdrop={<OnboardingBackdrop />}
      contentStyle={styles.content}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button label="Get started" size="lg" onPress={start} />
          <Button label="I already have an account" variant="ghost" onPress={signIn} />
        </View>
      }>
      <View style={styles.hero}>
        <ShieldMark size={104} />

        <View style={styles.wordmark}>
          <Text variant="hero" rounded align="center">
            {APP_NAME}
          </Text>
          <Text variant="body" tone="secondary" align="center" style={styles.tagline}>
            {APP_TAGLINE}
          </Text>
        </View>
      </View>

      <View style={[styles.points, { gap: theme.spacing.base, marginBottom: theme.spacing.lg }]}>
        {POINTS.map((point) => (
          <ValuePoint key={point.label} icon={point.icon} label={point.label} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // The mark already carries a wide glow box, so the wordmark pulls back up.
  wordmark: { alignItems: 'center', marginTop: -24 },
  tagline: { marginTop: 8, maxWidth: 300 },
  points: { width: '100%' },
});
