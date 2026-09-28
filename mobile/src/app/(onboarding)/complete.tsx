import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { ShieldMark, SummaryRow, firstParam, parseList } from '@/components/onboarding';
import { Badge, Button, Card, Divider, Header, Screen, Stepper, Text } from '@/components/ui';
import { PROTECTION_CATEGORIES, seedUser } from '@/data/seed';
import { describeWaitingPeriod, initialsFrom, plural } from '@/lib/format';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';
import type { ProtectionCategoryId } from '@/types';

const VALID_IDS = PROTECTION_CATEGORIES.map((category) => category.id);
const FALLBACK_CATEGORIES: ProtectionCategoryId[] = ['adult-websites', 'adult-apps'];

const DEVICE_NAME = Platform.OS === 'ios' ? 'this iPhone' : 'this Android phone';

export default function CompleteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { lock, accountabilityOn, user: signedIn } = useAppState();
  const partner = useActivePartner();
  const level = useProtectionLevel();

  const params = useLocalSearchParams<{ name?: string; email?: string; categories?: string }>();

  // Someone can deep-link straight here, so every value has a sensible default.
  const name = firstParam(params.name, seedUser.name);
  const email = firstParam(params.email, seedUser.email);

  const passed = parseList(params.categories).filter((id): id is ProtectionCategoryId =>
    (VALID_IDS as string[]).includes(id),
  );
  const categories = passed.length > 0 ? passed : FALLBACK_CATEGORIES;

  const lockValue =
    level.method === 'delay'
      ? `${level.name} (${describeWaitingPeriod(lock.waitingPeriodMinutes)})`
      : level.name;

  const finish = () => {
    // The account was created at the sign-up step, so its real id is already in
    // the store. The params are only a fallback for someone deep-linking
    // straight here, which the rest of this screen already guards against.
    dispatch({
      type: 'complete-onboarding',
      user: signedIn ?? {
        id: 'u_local',
        name,
        email,
        initials: initialsFrom(name),
        protectedSince: new Date().toISOString(),
      },
      categories,
    });
    router.replace('/(tabs)');
  };

  return (
    <Screen
      header={<Header onBack={false} right={<Stepper current={4} total={4} />} />}
      footer={<Button label="Go to dashboard" size="lg" onPress={finish} />}>
      <View style={styles.hero}>
        <ShieldMark size={96} tone="shield" />

        <View style={styles.headline}>
          <Text variant="display" rounded align="center">
            You’re protected
          </Text>
          <Text variant="body" tone="secondary" align="center" style={styles.lede}>
            {plural(categories.length, 'category', 'categories')} on, and {DEVICE_NAME} is
            registered. That is the barrier standing from now on.
          </Text>
        </View>
      </View>

      <Card variant="outlined" padding="base" style={{ marginTop: theme.spacing.lg }}>
        <Text variant="label" tone="muted" style={{ marginBottom: theme.spacing.md }}>
          Your starting setup
        </Text>

        <SummaryRow label="Protection" value={<Badge label="ON" tone="shield" dot />} />
        <View style={{ marginVertical: theme.spacing.md }}>
          <Divider />
        </View>

        <SummaryRow label="Lock" value={lockValue} />
        <View style={{ marginVertical: theme.spacing.md }}>
          <Divider />
        </View>

        <SummaryRow
          label="Accountability"
          value={
            accountabilityOn
              ? partner
                ? `${partner.name} · ${partner.relationship}`
                : 'On'
              : 'Off'
          }
        />
      </Card>

      <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.base }}>
        All three are separate, and all three are yours to change later from Protection.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 4 },
  // The mark carries a wide glow box; the headline pulls back into it.
  headline: { alignItems: 'center', marginTop: -20 },
  lede: { marginTop: 8, maxWidth: 320 },
});
