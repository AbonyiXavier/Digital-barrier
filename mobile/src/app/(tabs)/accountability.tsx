import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InviteJourney, PartnerRow, PrivacyPromise } from '@/components/accountability';
import { TAB_BAR_CLEARANCE } from '@/components/navigation/tab-bar';
import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  Toggle,
} from '@/components/ui';
import { APP_NAME } from '@/lib/app';
import { plural } from '@/lib/format';
import { useActivePartner, useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { Partner } from '@/types';

/** Approver first, then everyone who accepted, then invites, then declines. */
function rank(partner: Partner, approverId: string | null): number {
  if (partner.id === approverId) return 0;
  if (partner.status === 'active') return 1;
  if (partner.status === 'pending') return 2;
  return 3;
}

export default function AccountabilityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { accountabilityOn, partners, requests, lock, user } = useAppState();
  const approver = useActivePartner();

  const [openPartnerId, setOpenPartnerId] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...partners].sort((a, b) => rank(a, lock.partnerId) - rank(b, lock.partnerId)),
    [partners, lock.partnerId],
  );

  const activePartners = partners.filter((p) => p.status === 'active');
  const pendingRequests = requests.filter((r) => r.status === 'pending').length;
  const needsApprover = lock.level === 4 && !approver;

  const openInvite = () => {
    if (!accountabilityOn) dispatch({ type: 'set-accountability', on: true });
    router.push('/accountability/invite');
  };

  return (
    <Screen
      bottomInset={TAB_BAR_CLEARANCE}
      header={
        <Header
          title="Accountability"
          large
          onBack={false}
          subtitle={
            accountabilityOn
              ? 'Someone in your corner, chosen by you.'
              : 'An optional human layer. Off at the moment.'
          }
        />
      }>
      <Card variant="raised">
        <View style={[styles.row, { gap: theme.spacing.base }]}>
          <Text variant="h3" style={styles.flex}>
            Do you want someone else involved?
          </Text>
          <Toggle
            value={accountabilityOn}
            onValueChange={(on) => dispatch({ type: 'set-accountability', on })}
            tone="brand"
            accessibilityLabel="Accountability"
          />
        </View>

        <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.sm }}>
          One person you choose is told when you ask to turn protection off, so the decision is
          made out loud instead of alone. It changes nothing about what {APP_NAME} blocks, and it
          can be switched off again at any time.
        </Text>

        {accountabilityOn ? (
          <View style={[styles.note, { gap: theme.spacing.sm, marginTop: theme.spacing.base }]}>
            <Icon
              name={activePartners.length > 0 ? 'people' : 'people-outline'}
              size={15}
              color={activePartners.length > 0 ? theme.colors.shield : theme.colors.textMuted}
            />
            <Text
              variant="caption"
              tone={activePartners.length > 0 ? 'shield' : 'muted'}
              style={styles.flex}>
              {activePartners.length > 0
                ? `${activePartners.map((p) => p.name.split(' ')[0]).join(' and ')} ${
                    activePartners.length === 1 ? 'is' : 'are'
                  } in your corner.`
                : 'Nobody is involved yet — send an invitation when you are ready.'}
            </Text>
          </View>
        ) : null}
      </Card>

      {!accountabilityOn ? (
        <Section gap={theme.spacing.base}>
          <View style={{ gap: theme.spacing.md }}>
            <InviteJourney initials={user?.initials ?? 'You'} />
            <Button label="Invite someone" icon="person-add-outline" onPress={openInvite} />
            <Text variant="caption" tone="muted" align="center">
              Nothing happens until they accept, and you can change your mind either way.
            </Text>
          </View>
        </Section>
      ) : (
        <>
          <Section title="Your partners" action={{ label: 'Invite', onPress: openInvite }}>
            <View style={{ gap: theme.spacing.md }}>
              {ordered.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="person-add-outline"
                    title="No one yet"
                    description="Accountability is on, but nobody has been asked. Pick someone who already knows the hard parts."
                    action={{ label: 'Invite someone', onPress: openInvite }}
                  />
                </Card>
              ) : (
                <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
                  {ordered.map((partner, index) => (
                    <View key={partner.id}>
                      {/* Keyed on the open state so collapsing always clears
                          a half-armed removal. */}
                      <PartnerRow
                        key={String(openPartnerId === partner.id)}
                        partner={partner}
                        isApprover={partner.id === lock.partnerId}
                        expanded={openPartnerId === partner.id}
                        onToggle={() =>
                          setOpenPartnerId((current) =>
                            current === partner.id ? null : partner.id,
                          )
                        }
                      />
                      {index < ordered.length - 1 ? <Divider /> : null}
                    </View>
                  ))}
                </Card>
              )}

              {needsApprover ? (
                <Card variant="outlined">
                  <View style={[styles.note, { gap: theme.spacing.md }]}>
                    <Icon name="alert-circle-outline" size={19} color={theme.colors.warn} />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong">Protection level 4 has no approver</Text>
                      <Text variant="sub" tone="secondary" style={{ marginTop: 3 }}>
                        Your lock asks a partner to approve, but nobody is set to answer. Choose
                        one so a request can actually go somewhere.
                      </Text>
                      <Button
                        label="Choose an approver"
                        size="sm"
                        variant="secondary"
                        fullWidth={false}
                        style={{ marginTop: theme.spacing.md }}
                        onPress={() => router.push('/accountability/approval-settings')}
                      />
                    </View>
                  </View>
                </Card>
              ) : null}
            </View>
          </Section>

          <Section title="Requests and alerts">
            <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
              <ListRow
                icon="time-outline"
                iconColor={pendingRequests > 0 ? theme.colors.warn : undefined}
                title="Requests"
                subtitle="Times you asked to turn protection off."
                trailing={
                  pendingRequests > 0 ? (
                    <Badge label={plural(pendingRequests, 'waiting', 'waiting')} tone="warn" />
                  ) : (
                    <Text variant="caption" tone="muted">
                      None waiting
                    </Text>
                  )
                }
                divider
                onPress={() => router.push('/accountability/requests')}
              />
              <ListRow
                icon="notifications-outline"
                title="What your partner is told"
                subtitle="Choose which moments reach them, and how often."
                onPress={() => router.push('/accountability/approval-settings')}
              />
            </Card>
          </Section>

          <Section title="Your privacy">
            <PrivacyPromise />
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
