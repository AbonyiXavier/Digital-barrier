import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  FaqAccordion,
  InlineNote,
  ListGroup,
  useTransientNote,
  type FaqEntry,
} from '@/components/settings';
import {
  Card,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '@/components/ui';
import { APP_NAME, SUPPORT_EMAIL } from '@/lib/app';
import { useTheme } from '@/theme';

const FAQ: FaqEntry[] = [
  {
    id: 'wont-turn-off',
    question: 'Protection won’t turn off — is that a bug?',
    answer:
      'No. That is the Protection Lock doing exactly what you set it up to do. On Waiting period, protection stays on until the countdown ends. On Accountability, it stays on until your partner approves. You can see which one you are on, and change it, from Protection level.',
    action: { label: 'Protection level', path: '/protection/level' },
  },
  {
    id: 'forgot-pin',
    question: 'I forgot my PIN',
    answer:
      'Set a new one from Protection lock. Changing the PIN does not skip the lock: if you are on Waiting period or Accountability, that still applies, so a forgotten PIN can never become a shortcut.',
    action: { label: 'Protection lock', path: '/protection/lock' },
  },
  {
    id: 'false-positive',
    question: 'A safe site is blocked',
    answer:
      'It happens — the filter lists are deliberately broad. Add the domain to your allow list and it goes through on every one of your devices within about a minute.',
    action: { label: 'Open blocklist', path: '/blocklist' },
  },
  {
    id: 'add-laptop',
    question: 'How do I add my laptop?',
    answer:
      'Open Devices, tap Add device and choose Mac or Windows. You get a short code to enter on the laptop, and it joins with the protection level you already use here.',
    action: { label: 'Go to Devices', path: '/(tabs)/devices' },
  },
  {
    id: 'partner-history',
    question: 'Can my partner see my history?',
    answer:
      'No. Your partner sees requests to turn protection off and the reason you wrote with them. Nothing else. Aegis does not keep a record of the sites you visit, so there is no history to share.',
    action: { label: 'Read the privacy promise', path: '/settings/privacy' },
  },
  {
    id: 'delete-app',
    question: 'What happens if I delete the app?',
    answer:
      'Protection on that device stops with it — deleting the app is the last unlocked door, and we would rather be honest about that than pretend otherwise. If you have an accountability partner, they are told the device dropped off, so the decision is still one you make with someone.',
  },
  {
    id: 'slow-down',
    question: 'Does Aegis slow my connection down?',
    answer:
      'Not in a way you will notice. Filtering happens during the DNS lookup, before a page starts loading, and costs a few milliseconds.',
  },
  {
    id: 'no-partner',
    question: 'Can I use Aegis without a partner?',
    answer:
      'Yes. Accountability is one layer, not the product. Normal, Locked and Waiting period all work entirely on your own, and you can add a partner later without starting over.',
    action: { label: 'Protection level', path: '/protection/level' },
  },
];

export default function SupportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [note, showNote] = useTransientNote(6000);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return FAQ;
    return FAQ.filter(
      (entry) =>
        entry.question.toLowerCase().includes(term) || entry.answer.toLowerCase().includes(term),
    );
  }, [query]);

  return (
    <Screen alt header={<Header title="Support" />}>
      <TextField
        icon="search"
        value={query}
        onChangeText={setQuery}
        placeholder="Search help"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      <Section title={query.trim() ? 'Results' : 'Common questions'} gap={theme.spacing.lg}>
        {results.length > 0 ? (
          <FaqAccordion entries={results} />
        ) : (
          <Card padding="none">
            <EmptyState
              icon="search-outline"
              title="Nothing matches that"
              description="Try a shorter word, or send us the question and a person will answer it."
              action={{ label: 'Clear search', onPress: () => setQuery('') }}
            />
          </Card>
        )}
      </Section>

      <Section title="Still stuck?">
        <ListGroup>
          <ListRow
            title="Email us"
            subtitle={SUPPORT_EMAIL}
            icon="mail-outline"
            chevron={false}
            trailing={<Icon name="open-outline" size={17} color={theme.colors.textMuted} />}
            onPress={() => showNote(`Write to ${SUPPORT_EMAIL} — a person replies within a day.`)}
          />
          <ListRow
            title="Report a blocked site that should be allowed"
            subtitle="Add it to your allow list, and tell us so everyone benefits"
            icon="flag-outline"
            onPress={() => router.push('/blocklist')}
          />
          <ListRow
            title="Community guidelines"
            subtitle="How we talk to each other in the forum"
            icon="people-circle-outline"
            chevron={false}
            trailing={<Icon name="open-outline" size={17} color={theme.colors.textMuted} />}
            onPress={() => showNote('Opens the community guidelines in your browser in the real app.')}
          />
        </ListGroup>
        {note ? <InlineNote text={note} tone="muted" icon="information-circle-outline" /> : null}
      </Section>

      <Card padding="lg" style={{ marginTop: theme.spacing.xl }}>
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <View
            style={[
              styles.chip,
              { borderRadius: theme.radius.md, backgroundColor: theme.colors.brandSoft },
            ]}>
            <Icon name="heart-outline" size={20} color={theme.colors.brand} />
          </View>
          <Text variant="body" tone="secondary" style={styles.flex}>
            Recovery is not a straight line, and a hard day is not a failed one. {APP_NAME} keeps
            standing where you put it, especially on those days.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  chip: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
