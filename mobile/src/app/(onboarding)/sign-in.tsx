import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SecretField } from '@/components/onboarding';
import { Button, Header, Screen, Text, TextField } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, signIn } from '@/lib/api/auth';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

type FieldName = 'email' | 'password';

/**
 * Signing back in.
 *
 * Deliberately not the create-account screen with a field hidden: asking a
 * returning user for their full name is the kind of small wrongness that makes
 * an app feel unfinished, and there is nothing to do with the answer.
 *
 * There is also no step indicator here. This is not step one of anything — the
 * account already exists, so this screen either lands you on the dashboard or it
 * does not.
 */
export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refresh } = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    email: false,
    password: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const emailOk = email.includes('@');
  const passwordOk = password.length > 0;
  const ready = emailOk && passwordOk;

  const blur = (field: FieldName) => () =>
    setTouched((current) => ({ ...current, [field]: true }));

  const errorFor = (field: FieldName, valid: boolean, message: string) =>
    touched[field] && !valid ? message : undefined;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await signIn({ email: email.trim(), password });
      // Pull the account down before leaving, so the dashboard has real data on
      // its first render rather than the seed.
      await refresh();
      // Nothing after this touches state: `replace` unmounts this screen, and a
      // setState on the way out is the "update on an unmounted component"
      // warning.
      router.replace('/(tabs)');
      return;
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'Could not sign you in. Check your email and password.',
      );
      setSubmitting(false);
    }
  };

  return (
    <Screen
      header={
        <Header
          large
          title="Welcome back"
          subtitle="Your protection settings are waiting where you left them."
        />
      }
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={submitting ? 'Signing in…' : 'Sign in'}
            size="lg"
            disabled={!ready || submitting}
            onPress={() => void submit()}
          />
          <Button
            label="Create an account instead"
            variant="ghost"
            disabled={submitting}
            onPress={() => router.replace('/(onboarding)/create-account')}
          />
        </View>
      }>
      <View style={[styles.stack, { gap: theme.spacing.base, marginTop: theme.spacing.lg }]}>
        <TextField
          label="Email"
          icon="mail-outline"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          onBlur={blur('email')}
          error={errorFor('email', emailOk, 'That address is missing an @.')}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <SecretField
          label="Password"
          icon="key-outline"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          value={password}
          onChangeText={setPassword}
          onBlur={blur('password')}
          error={errorFor('password', passwordOk, 'Enter your password.')}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (ready) void submit();
          }}
        />
      </View>

      {failure !== null ? (
        <Text variant="caption" tone="danger" style={{ marginTop: theme.spacing.base }}>
          {failure}
        </Text>
      ) : null}

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.lg }}>
        Signing in does not change anything on this device until your settings load.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { width: '100%' },
});
