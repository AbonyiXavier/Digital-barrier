import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote, useTransientNote } from '@/components/settings';
import {
  Avatar,
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '@/components/ui';
import { initialsFrom, plural } from '@/lib/format';
import { useAppDispatch, useAppState, useProtectedDays } from '@/store/app-store';
import { useTheme } from '@/theme';

const MIN_PASSWORD_LENGTH = 8;

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAppState();
  const dispatch = useAppDispatch();
  const protectedDays = useProtectedDays();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [note, showNote] = useTransientNote();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const valid = trimmedName.length > 0 && trimmedEmail.includes('@');
  const changed = trimmedName !== (user?.name ?? '') || trimmedEmail !== (user?.email ?? '');

  const savePassword = () => {
    setPasswordSaved(false);

    if (current.length === 0) {
      setPasswordError('Enter your current password first');
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (next !== confirm) {
      setPasswordError('The two new passwords do not match');
      return;
    }

    setPasswordError(null);
    setCurrent('');
    setNext('');
    setConfirm('');
    setPasswordSaved(true);
  };

  const saveProfile = () => {
    dispatch({
      type: 'patch-user',
      patch: { name: trimmedName, email: trimmedEmail, initials: initialsFrom(trimmedName) },
    });
    router.back();
  };

  return (
    <Screen
      alt
      header={<Header title="Profile" />}
      footer={
        <Button label="Save changes" disabled={!changed || !valid} onPress={saveProfile} />
      }>
      <View style={styles.identity}>
        <Avatar initials={initialsFrom(trimmedName) || (user?.initials ?? '?')} size={88} />
        <Button
          label="Change photo"
          variant="ghost"
          size="sm"
          icon="camera-outline"
          fullWidth={false}
          onPress={() => showNote('Photos are not part of this prototype — your initials stay.')}
        />
        {note ? <InlineNote text={note} tone="muted" icon="information-circle-outline" /> : null}
      </View>

      <Section title="Your details" gap={theme.spacing.lg}>
        <Card padding="base">
          <View style={{ gap: theme.spacing.base }}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="name"
            />
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              hint="Used to sign in and to recover your account."
              error={trimmedEmail.length > 0 && !trimmedEmail.includes('@') ? 'That does not look like an email address' : undefined}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
          </View>
        </Card>
      </Section>

      {user ? (
        <Section title="Since you started">
          <Card padding="base">
            <View style={[styles.row, { gap: theme.spacing.md }]}>
              <View
                style={[
                  styles.chip,
                  {
                    borderRadius: theme.radius.md,
                    backgroundColor: theme.colors.shieldSoft,
                  },
                ]}>
                <Icon name="shield-checkmark" size={20} color={theme.colors.shield} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">Protected since {longDate(user.protectedSince)}</Text>
                <Text variant="sub" tone="secondary" style={{ marginTop: 2 }}>
                  {plural(protectedDays, 'day')} of a barrier you set on a clearer day.
                </Text>
              </View>
            </View>
          </Card>
        </Section>
      ) : null}

      <Section title="Security">
        <Card padding="none">
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <ListRow
              title="Change password"
              subtitle={passwordOpen ? 'Pick something you have not used before' : 'At least eight characters'}
              icon="key-outline"
              chevron={false}
              trailing={
                <Icon
                  name={passwordOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={passwordOpen ? theme.colors.brand : theme.colors.textMuted}
                />
              }
              divider={passwordOpen}
              onPress={() => {
                setPasswordOpen((open) => !open);
                setPasswordError(null);
                setPasswordSaved(false);
              }}
            />

            {passwordOpen ? (
              <View style={{ gap: theme.spacing.base, paddingVertical: theme.spacing.base }}>
                <TextField
                  label="Current password"
                  value={current}
                  onChangeText={setCurrent}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="password"
                />
                <TextField
                  label="New password"
                  value={next}
                  onChangeText={setNext}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
                />
                <TextField
                  label="Confirm new password"
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType="newPassword"
                  error={passwordError ?? undefined}
                />
                <Button label="Save password" variant="secondary" onPress={savePassword} />
                {passwordSaved ? (
                  <InlineNote text="Password updated. You stay signed in on every device." />
                ) : null}
              </View>
            ) : null}
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 12, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
