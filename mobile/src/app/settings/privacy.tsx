import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  ConfirmRow,
  InlineNote,
  ListGroup,
  NeverRow,
  useTransientNote,
} from '@/components/settings';
import { Card, Header, Icon, ListRow, Screen, Section, Text } from '@/components/ui';
import { APP_NAME } from '@/lib/app';
import { useTheme } from '@/theme';

export default function PrivacyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [note, showNote] = useTransientNote(6000);

  return (
    <Screen alt header={<Header title="Privacy" />}>
      <Card padding="lg">
        <View
          style={[
            styles.chip,
            { borderRadius: theme.radius.md, backgroundColor: theme.colors.shieldSoft },
          ]}>
          <Icon name="lock-closed" size={22} color={theme.colors.shield} />
        </View>

        <Text variant="h2" style={{ marginTop: theme.spacing.base }}>
          Your browsing stays yours
        </Text>
        <Text variant="body" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
          {APP_NAME} filters DNS on the device. A request is either allowed through or it is not —
          and that decision is made and forgotten in the same moment. There is no log of the sites
          you visit, here or on a server.
        </Text>
      </Card>

      <Section title="What we store" description="All of it, in plain language.">
        <ListGroup>
          <ListRow
            title="Your account"
            subtitle="Your name and email, so you can sign in on a new device."
            icon="person-outline"
            chevron={false}
          />
          <ListRow
            title="Your protection settings"
            subtitle="Your level, waiting period, categories and your own allow and block rules."
            icon="options-outline"
            chevron={false}
          />
          <ListRow
            title="Your devices"
            subtitle="A name and a platform for each device, so you can tell them apart."
            icon="phone-portrait-outline"
            chevron={false}
          />
          <ListRow
            title="How many requests were blocked"
            subtitle="A count per day. A number, never a name."
            icon="stats-chart-outline"
            chevron={false}
          />
        </ListGroup>
      </Section>

      <Section title="What we never store">
        <Card padding="none" variant="outlined">
          <View style={{ paddingHorizontal: theme.spacing.base }}>
            <NeverRow
              title="The sites you visit"
              subtitle="No history, no domains, not even the blocked ones."
              divider
            />
            <NeverRow
              title="Your search terms"
              subtitle="Safe search is enforced at the edge, never recorded."
              divider
            />
            <NeverRow
              title="The content of any page"
              subtitle="Aegis never sees inside a page, only the address it asked for."
            />
          </View>
        </Card>
      </Section>

      <Section title="Your partner">
        <Card padding="base">
          <Text variant="body" tone="secondary">
            A partner sees one thing: a request to turn protection off, and the reason you wrote
            with it. They never see browsing activity, because there is none to see.
          </Text>
        </Card>
        <View style={{ marginTop: theme.spacing.md }}>
          <ListGroup>
            <ListRow
              title="What your partner sees"
              subtitle="Approval settings and notifications"
              icon="people-outline"
              onPress={() => router.push('/accountability/approval-settings')}
            />
          </ListGroup>
        </View>
      </Section>

      <Section title="Controls">
        <ListGroup>
          <ListRow
            title="Download my data"
            subtitle="Everything above, as a single file"
            icon="download-outline"
            chevron={false}
            onPress={() =>
              showNote('In the real app your file is emailed within an hour. Nothing to export in the prototype.')
            }
          />
          <ConfirmRow
            title="Delete my account"
            confirmTitle="Tap again to delete everything"
            subtitle="Removes your account, settings and devices"
            confirmSubtitle="This cannot be undone. Wait a moment and nothing happens."
            icon="trash-outline"
            iconColor={theme.colors.danger}
            onConfirm={() =>
              showNote('Deletion is disabled in the prototype. Your data is still here.')
            }
          />
        </ListGroup>
        {note ? <InlineNote text={note} tone="muted" icon="information-circle-outline" /> : null}
      </Section>

      <Section title="The long version">
        <ListGroup>
          <ListRow
            title="Privacy policy"
            subtitle="aegis.app/privacy"
            icon="document-text-outline"
            iconColor={theme.colors.textMuted}
            chevron={false}
            trailing={<Icon name="open-outline" size={17} color={theme.colors.textMuted} />}
            onPress={() => showNote('Opens aegis.app/privacy in your browser in the real app.')}
          />
          <ListRow
            title="Terms of service"
            subtitle="aegis.app/terms"
            icon="document-text-outline"
            iconColor={theme.colors.textMuted}
            chevron={false}
            trailing={<Icon name="open-outline" size={17} color={theme.colors.textMuted} />}
            onPress={() => showNote('Opens aegis.app/terms in your browser in the real app.')}
          />
        </ListGroup>
      </Section>

      <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.xl }}>
        A promise is only worth what it costs to keep. This one costs us a feature we will never
        build.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
