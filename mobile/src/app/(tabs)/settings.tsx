import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { TAB_BAR_CLEARANCE } from '@/components/navigation/tab-bar';
import { ConfirmButton, ListGroup } from '@/components/settings';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
} from '@/components/ui';
import { signOut } from '@/lib/api/auth';
import { APP_NAME } from '@/lib/app';
import { plural, relativeTime } from '@/lib/format';
import {
  useActivePartner,
  useAppDispatch,
  useAppState,
  useProtectionLevel,
} from '@/store/app-store';
import { useTheme } from '@/theme';

function renewalLabel(iso: string | null): string {
  if (!iso) return 'Renews automatically';
  const date = new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `Renews on ${date}`;
}

export default function SettingsScreen() {
  const theme = useTheme();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const level = useProtectionLevel();
  const partner = useActivePartner();
  const router = useRouter();

  const isPremium = state.subscription.plan === 'premium';
  const name = state.user?.name ?? 'Your account';
  const email = state.user?.email ?? 'Not signed in';
  const initials = state.user?.initials ?? '?';

  return (
    <Screen
      alt
      bottomInset={TAB_BAR_CLEARANCE}
      header={<Header title="Settings" onBack={false} large />}>
      <Card padding="base" onPress={() => router.push('/settings/profile')}>
        <View style={[styles.row, { gap: theme.spacing.base }]}>
          <Avatar initials={initials} size={56} />
          <View style={styles.flex}>
            <Text variant="h3" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="sub" tone="muted" numberOfLines={1} style={{ marginTop: 2 }}>
              {email}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>
      </Card>

      <Card
        padding="base"
        onPress={() => router.push('/subscription')}
        style={{ marginTop: theme.spacing.md }}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Badge
              label={isPremium ? 'Premium' : 'Free'}
              tone={isPremium ? 'brand' : 'neutral'}
              icon={isPremium ? 'sparkles' : undefined}
            />
          </View>
          <Icon name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </View>

        <Text variant="h3" style={{ marginTop: theme.spacing.md }}>
          {isPremium ? 'Every lock is yours' : 'Room for a stronger barrier'}
        </Text>
        <Text variant="sub" tone="secondary" style={{ marginTop: 4 }}>
          {isPremium
            ? renewalLabel(state.subscription.renewsAt)
            : 'Premium adds the waiting period and partner locks, unlimited devices, and safe search.'}
        </Text>

        {isPremium ? null : (
          <View style={{ marginTop: theme.spacing.base }}>
            <Button
              label="Upgrade"
              size="sm"
              icon="sparkles"
              fullWidth={false}
              onPress={() => router.push('/subscription')}
            />
          </View>
        )}
      </Card>

      <Section title="Protection">
        <ListGroup>
          <ListRow
            title="Protection level"
            subtitle={level.name}
            icon="shield-checkmark"
            iconColor={theme.colors.shield}
            onPress={() => router.push('/protection/level')}
          />
          <ListRow
            title="Protection lock"
            subtitle={level.tagline}
            icon="lock-closed"
            iconColor={theme.colors.shield}
            onPress={() => router.push('/protection/lock')}
          />
          <ListRow
            title="Protection status"
            subtitle={`Up to date · ${relativeTime(state.blocklist.lastCheckedAt)}`}
            icon="list"
            iconColor={theme.colors.shield}
            onPress={() => router.push('/blocklist')}
          />
          <ListRow
            title="Blocked page"
            subtitle="Customise what people see"
            icon="browsers"
            iconColor={theme.colors.shield}
            onPress={() => router.push('/blocked-screen')}
          />
        </ListGroup>
      </Section>

      <Section title="Account">
        <ListGroup>
          <ListRow
            title="Profile"
            subtitle="Name, email and password"
            icon="person-circle"
            onPress={() => router.push('/settings/profile')}
          />
          <ListRow
            title="Accountability"
            subtitle={partner ? partner.name : 'Off'}
            icon="people"
            onPress={() => router.push('/(tabs)/accountability')}
          />
          <ListRow
            title="Devices"
            subtitle={plural(state.devices.length, 'device')}
            icon="phone-portrait"
            onPress={() => router.push('/(tabs)/devices')}
          />
          <ListRow
            title="Subscription"
            subtitle={isPremium ? 'Premium' : 'Free'}
            icon="sparkles"
            iconColor={theme.colors.warn}
            onPress={() => router.push('/subscription')}
          />
        </ListGroup>
      </Section>

      <Section title="Preferences">
        <ListGroup>
          <ListRow
            title="Notifications"
            subtitle="What Aegis tells you, and when"
            icon="notifications"
            onPress={() => router.push('/settings/notifications')}
          />
          <ListRow
            title="Privacy"
            subtitle="What is stored, and what never is"
            icon="eye-off"
            onPress={() => router.push('/settings/privacy')}
          />
          <ListRow
            title="Support"
            subtitle="Answers and a way to reach us"
            icon="help-buoy"
            onPress={() => router.push('/settings/support')}
          />
        </ListGroup>
      </Section>

      <Section>
        <View style={{ gap: theme.spacing.md }}>
          <ConfirmButton
            label="Sign out"
            variant="danger"
            icon="log-out-outline"
            onConfirm={() => {
              // Clear the session first: navigating away without it would leave
              // the next person on this phone signed in as you.
              void signOut().finally(() => {
                dispatch({ type: 'reset' });
                router.replace('/(onboarding)/welcome');
              });
            }}
          />
          <Text variant="caption" tone="muted" align="center">
            Protection keeps running on this device while you are signed out.
          </Text>
          <ConfirmButton
            label="Reset prototype data"
            variant="ghost"
            size="sm"
            icon="refresh-outline"
            onConfirm={() => {
              void signOut().finally(() => {
                dispatch({ type: 'reset' });
                router.replace('/(onboarding)/welcome');
              });
            }}
          />
        </View>
      </Section>

      <Text
        variant="micro"
        tone="muted"
        align="center"
        style={{ marginTop: theme.spacing.xl }}>
        {APP_NAME} · version 1.0.0 (prototype)
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
