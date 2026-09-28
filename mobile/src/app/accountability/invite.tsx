import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NotificationPreview } from '@/components/accountability';
import {
  Button,
  Header,
  Icon,
  OptionCard,
  Screen,
  Section,
  Text,
  TextField,
  type IconName,
} from '@/components/ui';
import { initialsFrom } from '@/lib/format';
import { useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';

type Relationship = { label: string; description: string; icon: IconName };

const DEFAULT_RELATIONSHIP = 'Spouse';

const RELATIONSHIPS: readonly Relationship[] = [
  { label: 'Spouse', description: 'Husband, wife or partner', icon: 'heart-outline' },
  { label: 'Friend', description: 'Someone who already knows you well', icon: 'happy-outline' },
  { label: 'Sibling', description: 'A brother or a sister', icon: 'people-outline' },
  { label: 'Parent', description: 'A mother or a father', icon: 'home-outline' },
  { label: 'Mentor', description: 'A pastor, coach, sponsor or counsellor', icon: 'compass-outline' },
];

export default function InvitePartnerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, accountabilityOn } = useAppState();

  const [relationship, setRelationship] = useState<string>(DEFAULT_RELATIONSHIP);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touchedName, setTouchedName] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameValid = trimmedName.length > 0;
  const emailValid = trimmedEmail.includes('@') && trimmedEmail.length > 2;
  const valid = nameValid && emailValid;

  const send = () => {
    if (!valid) return;

    dispatch({
      type: 'add-partner',
      partner: {
        id: `p_${Date.now()}`,
        name: trimmedName,
        relationship,
        email: trimmedEmail,
        status: 'pending',
        invitedAt: new Date().toISOString(),
        initials: initialsFrom(trimmedName),
      },
    });

    if (!accountabilityOn) dispatch({ type: 'set-accountability', on: true });

    router.back();
  };

  return (
    <Screen
      header={<Header title="Invite a partner" onBack={() => router.back()} />}
      footer={
        <Button
          label="Send invite"
          icon="paper-plane-outline"
          disabled={!valid}
          onPress={send}
        />
      }>
      <View style={[styles.intro, { gap: theme.spacing.md }]}>
        <Icon name="people-circle-outline" size={22} color={theme.colors.brand} />
        <Text variant="sub" tone="secondary" style={styles.flex}>
          Choose someone who already knows the hard parts, and who you would be glad to hear from.
          They are asked to accept before anything reaches them.
        </Text>
      </View>

      <Section title="Step 1 · Who is this?">
        <View style={{ gap: theme.spacing.md }}>
          {RELATIONSHIPS.map((option) => (
            <OptionCard
              key={option.label}
              title={option.label}
              description={option.description}
              icon={option.icon}
              indicator="radio"
              selected={relationship === option.label}
              onPress={() => setRelationship(option.label)}
            />
          ))}
        </View>
      </Section>

      <Section title="Step 2 · Their details">
        <View style={{ gap: theme.spacing.base }}>
          <TextField
            label="Their name"
            icon="person-outline"
            placeholder="Amara Abonyi"
            value={name}
            onChangeText={setName}
            onBlur={() => setTouchedName(true)}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            error={touchedName && !nameValid ? 'A name helps you tell partners apart.' : undefined}
          />

          <TextField
            label="Their email"
            icon="mail-outline"
            placeholder="amara@example.com"
            value={email}
            onChangeText={setEmail}
            onBlur={() => setTouchedEmail(true)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            hint="The invitation goes here. Nothing else is ever sent to it."
            error={
              touchedEmail && !emailValid ? 'That address is missing an @ somewhere.' : undefined
            }
          />
        </View>
      </Section>

      <Section
        title="What they will receive"
        description="The whole message, exactly as it arrives on their phone.">
        <NotificationPreview
          userName={user?.name ?? 'Your name'}
          partnerName={nameValid ? trimmedName.split(' ')[0] : undefined}
        />
      </Section>

      <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.base }}>
        {trimmedName.length > 0 ? trimmedName.split(' ')[0] : 'They'} can decline, and you can
        remove them later without explaining yourself to anyone.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
