import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BlockedPreview } from '@/components/blocklist/blocked-preview';
import {
  Button,
  Card,
  Header,
  Icon,
  ListRow,
  Screen,
  Section,
  Segmented,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { seedBlockedScreen } from '@/data/seed';
import { useActivePartner, useAppDispatch, useAppState, useIsPremium } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { BlockedScreenTheme } from '@/types';

const THEMES = [
  { value: 'calm', label: 'Calm' },
  { value: 'bold', label: 'Bold' },
  { value: 'minimal', label: 'Minimal' },
] as const satisfies readonly { value: BlockedScreenTheme; label: string }[];

const HEADLINE_MAX = 40;
const MESSAGE_MAX = 160;

export default function BlockedScreenEditor() {
  const theme = useTheme();
  const router = useRouter();
  const { blockedScreen, blocklist, partners } = useAppState();
  const dispatch = useAppDispatch();
  const isPremium = useIsPremium();

  const lockPartner = useActivePartner();
  const partner = lockPartner ?? partners.find((p) => p.status === 'active') ?? null;

  const previewDomain = blocklist.blocked[0] ?? 'example-adult-site.com';

  return (
    <Screen header={<Header title="Blocked page" />} alt>
      <Text variant="sub" tone="secondary" align="center" style={{ marginTop: theme.spacing.sm }}>
        This is what shows up instead of the site. Change anything below and watch it here.
      </Text>

      <View style={{ marginTop: theme.spacing.lg }}>
        <BlockedPreview
          config={blockedScreen}
          domain={previewDomain}
          partnerName={partner?.name ?? null}
        />
      </View>

      <Section title="Style">
        <Segmented
          options={THEMES}
          value={blockedScreen.theme}
          onChange={(next) => dispatch({ type: 'patch-blocked-screen', patch: { theme: next } })}
        />
        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {blockedScreen.theme === 'calm'
            ? 'Soft and unhurried. The default, and the kindest in a hard moment.'
            : blockedScreen.theme === 'bold'
              ? 'Dark and direct. Hard to argue with, hard to scroll past.'
              : 'Almost nothing. A quiet full stop, with no drama attached.'}
        </Text>
      </Section>

      <View>
        <View
          pointerEvents={isPremium ? 'auto' : 'none'}
          style={{ opacity: isPremium ? 1 : 0.3 }}>
          <Section title="Words">
            <View style={{ gap: theme.spacing.base }}>
              <TextField
                label="Headline"
                value={blockedScreen.headline}
                maxLength={HEADLINE_MAX}
                hint={`${blockedScreen.headline.length}/${HEADLINE_MAX}`}
                autoCapitalize="sentences"
                onChangeText={(headline) =>
                  dispatch({ type: 'patch-blocked-screen', patch: { headline } })
                }
              />
              <TextField
                label="Message"
                value={blockedScreen.message}
                maxLength={MESSAGE_MAX}
                hint={`${blockedScreen.message.length}/${MESSAGE_MAX}`}
                multiline
                numberOfLines={3}
                autoCapitalize="sentences"
                style={styles.multiline}
                onChangeText={(message) =>
                  dispatch({ type: 'patch-blocked-screen', patch: { message } })
                }
              />
            </View>
          </Section>

          <Section title="On the page">
            <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
              <ListRow
                title="Message my partner"
                subtitle="A one-tap way to reach out instead of pushing through. Your partner still sees no history."
                icon="chatbubble-ellipses-outline"
                chevron={false}
                divider
                trailing={
                  <Toggle
                    tone="brand"
                    value={blockedScreen.showPartnerButton}
                    accessibilityLabel="Show the message partner button"
                    onValueChange={(showPartnerButton) =>
                      dispatch({ type: 'patch-blocked-screen', patch: { showPartnerButton } })
                    }
                  />
                }
              />
              <ListRow
                title="Breathing exercise"
                subtitle="A slow circle to follow before the page can be dismissed. Most urges pass inside a minute."
                icon="ellipse-outline"
                chevron={false}
                trailing={
                  <Toggle
                    tone="brand"
                    value={blockedScreen.showBreathingExercise}
                    accessibilityLabel="Show the breathing exercise"
                    onValueChange={(showBreathingExercise) =>
                      dispatch({ type: 'patch-blocked-screen', patch: { showBreathingExercise } })
                    }
                  />
                }
              />
            </Card>

            <Button
              label="Reset to default"
              variant="ghost"
              size="sm"
              onPress={() =>
                dispatch({ type: 'patch-blocked-screen', patch: { ...seedBlockedScreen } })
              }
              style={{ marginTop: theme.spacing.md }}
            />
          </Section>
        </View>

        {isPremium ? null : (
          <View style={[StyleSheet.absoluteFill, styles.gate]} pointerEvents="box-none">
            <Card variant="raised" padding="lg" style={styles.gateCard}>
              <View
                style={[
                  styles.gateIcon,
                  { backgroundColor: theme.colors.brandSoft, borderRadius: theme.radius.md },
                ]}>
                <Icon name="lock-closed" size={18} color={theme.colors.brand} />
              </View>
              <Text variant="h3" align="center" style={{ marginTop: theme.spacing.md }}>
                Customise with Premium
              </Text>
              <Text
                variant="sub"
                tone="secondary"
                align="center"
                style={{ marginTop: theme.spacing.sm }}>
                Write your own words, add the partner button and the breathing circle. Try the
                three styles above first — those stay free to look at.
              </Text>
              <Button
                label="See Premium"
                onPress={() => router.push('/subscription')}
                style={{ marginTop: theme.spacing.base }}
              />
            </Card>
          </View>
        )}
      </View>

      <Text variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.xl }}>
        This page appears on every device on your account, in every browser, in place of the
        error the network would otherwise show.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 76, paddingTop: 14, textAlignVertical: 'top' },
  gate: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  gateCard: { width: '100%', maxWidth: 340, alignItems: 'center' },
  gateIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
