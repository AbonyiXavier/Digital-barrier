import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LabelledDivider, SecretField } from '@/components/onboarding';
import { Button, Header, Screen, Stepper, Text, TextField } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, signUp } from '@/lib/api/auth';
import { useAppStore } from '@/store/app-store';
import { useTheme } from '@/theme';

type FieldName = 'name' | 'email' | 'password';

const MIN_PASSWORD = MIN_PASSWORD_LENGTH;

export default function CreateAccountScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { refresh } = useAppStore();

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    name: false,
    email: false,
    password: false,
  });

  const nameOk = name.trim().length > 0;
  const emailOk = email.includes('@');
  const passwordOk = password.length >= MIN_PASSWORD;
  const ready = nameOk && emailOk && passwordOk;

  const blur = (field: FieldName) => () =>
    setTouched((current) => ({ ...current, [field]: true }));

  const errorFor = (field: FieldName, valid: boolean, message: string) =>
    touched[field] && !valid ? message : undefined;

  const goOn = () =>
    router.push({
      pathname: '/(onboarding)/choose-protection',
      params: { name: name.trim(), email: email.trim() },
    });

  const next = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await signUp({ name: name.trim(), email: email.trim(), password });
      // Pull the real account down before the next step, so nothing downstream
      // has to invent a user id.
      await refresh().catch(() => {});
      goOn();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      header={
        <Header
          large
          title="Create your account"
          subtitle="About a minute, and nothing to verify. Your account only holds your settings."
          right={<Stepper current={1} total={4} />}
        />
      }
      footer={
        <Button
          label={submitting ? 'Creating your account…' : 'Continue'}
          size="lg"
          disabled={!ready || submitting}
          onPress={() => void next()}
        />
      }>
      <View style={[styles.stack, { gap: theme.spacing.sm, marginTop: theme.spacing.lg }]}>
        <Button
          label="Continue with Apple"
          variant="secondary"
          icon="logo-apple"
          disabled
        />
        <Button
          label="Continue with Google"
          variant="secondary"
          icon="logo-google"
          disabled
        />
      </View>

      <View style={{ marginVertical: theme.spacing.lg }}>
        <LabelledDivider label="or" />
      </View>

      <View style={[styles.stack, { gap: theme.spacing.base }]}>
        <TextField
          label="Full name"
          icon="person-outline"
          placeholder="Your name"
          value={name}
          onChangeText={setName}
          onBlur={blur('name')}
          error={errorFor('name', nameOk, 'Tell us what to call you.')}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

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
          placeholder="At least 8 characters"
          hint="Long beats complicated. A short phrase works well."
          value={password}
          onChangeText={setPassword}
          onBlur={blur('password')}
          error={errorFor('password', passwordOk, 'Use at least 8 characters.')}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
        />
      </View>

      {failure !== null ? (
        <Text variant="caption" tone="danger" style={{ marginTop: theme.spacing.base }}>
          {failure}
        </Text>
      ) : null}

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.lg }}>
        We store your settings, never your browsing. Nothing you visit leaves this device.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { width: '100%' },
});
