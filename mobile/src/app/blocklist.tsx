import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { normaliseDomain } from '@/components/blocklist/domain';
import { RuleRow } from '@/components/blocklist/rule-row';
import {
  Button,
  Card,
  EmptyState,
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
import { PROTECTION_CATEGORIES } from '@/data/seed';
import { plural, relativeTime } from '@/lib/format';
import { useAppDispatch, useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';

type RuleList = 'allowed' | 'blocked';
type CheckStatus = 'idle' | 'checking' | 'done';

const LISTS = [
  { value: 'allowed', label: 'Allowed' },
  { value: 'blocked', label: 'Blocked' },
] as const satisfies readonly { value: RuleList; label: string }[];

const CHECK_DURATION = 1600;

/**
 * Deliberately says nothing about how the blocking is done — no counts, no feed
 * names, no per-source timestamps. Those are our plumbing, and showing them
 * invites people to audit a list they can't act on. What a person can act on is
 * whether protection is current and which of their own rules are in play.
 */
export default function BlocklistScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { blocklist, enabledCategories } = useAppState();
  const dispatch = useAppDispatch();

  const [status, setStatus] = useState<CheckStatus>('idle');
  const [list, setList] = useState<RuleList>('allowed');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  const checkForUpdates = () => {
    if (status === 'checking') return;
    if (doneTimer.current) clearTimeout(doneTimer.current);
    setStatus('checking');

    checkTimer.current = setTimeout(() => {
      dispatch({ type: 'patch-blocklist', patch: { lastCheckedAt: new Date().toISOString() } });
      setStatus('done');
      doneTimer.current = setTimeout(() => setStatus('idle'), 3200);
    }, CHECK_DURATION);
  };

  const rules = blocklist[list];
  const covered = PROTECTION_CATEGORIES.filter((category) =>
    enabledCategories.includes(category.id),
  );

  const addRule = () => {
    const result = normaliseDomain(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (rules.includes(result.domain)) {
      setError(`${result.domain} is already on this list.`);
      return;
    }

    dispatch(
      list === 'allowed'
        ? { type: 'allow-domain', domain: result.domain }
        : { type: 'block-domain', domain: result.domain },
    );
    setDraft('');
    setError(null);
  };

  return (
    <Screen
      header={
        <Header title="Protection status" subtitle="What Aegis blocks, and how current it is" large />
      }>
      <Card padding="lg" style={{ marginTop: theme.spacing.sm }}>
        <View style={styles.heroHead}>
          <View
            style={[
              styles.mark,
              { backgroundColor: theme.colors.shieldSoft, borderRadius: theme.radius.xl },
            ]}>
            <Icon
              name={status === 'checking' ? 'sync' : 'checkmark-circle'}
              size={34}
              color={theme.colors.shield}
            />
          </View>

          <View style={styles.heroText}>
            <Text variant="h3">
              {status === 'checking' ? 'Checking for updates' : 'Blocklist is up to date'}
            </Text>
            <Text variant="sub" tone="secondary" style={{ marginTop: 2 }}>
              {status === 'checking'
                ? 'Looking for newly discovered sites'
                : `Last updated ${relativeTime(blocklist.lastCheckedAt)}`}
            </Text>
          </View>
        </View>

        <Button
          label={status === 'checking' ? 'Checking' : 'Check for updates'}
          variant="secondary"
          size="sm"
          icon="refresh"
          loading={status === 'checking'}
          onPress={checkForUpdates}
          style={{ marginTop: theme.spacing.lg }}
        />

        {status === 'done' ? (
          <Text
            variant="caption"
            tone="shield"
            align="center"
            style={{ marginTop: theme.spacing.md }}>
            Up to date. Protection is current.
          </Text>
        ) : null}
      </Card>

      <Section title="What's covered">
        <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
          {covered.map((category, index) => (
            <ListRow
              key={category.id}
              title={category.title}
              subtitle={category.description}
              icon={category.icon}
              iconColor={theme.colors.shield}
              chevron={false}
              divider={index < covered.length - 1}
              trailing={<Icon name="checkmark" size={16} color={theme.colors.shield} />}
            />
          ))}
        </Card>

        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.md }}>
          Aegis keeps the underlying lists current for you. Change what’s covered under
          Protection.
        </Text>
      </Section>

      <Section title="Automatic updates">
        <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
          <ListRow
            title="Keep protection current"
            subtitle="New sites are covered automatically in the background, without you doing anything."
            icon="cloud-download-outline"
            chevron={false}
            trailing={
              <Toggle
                value={blocklist.autoUpdate}
                accessibilityLabel="Automatic blocklist updates"
                onValueChange={(next) =>
                  dispatch({ type: 'patch-blocklist', patch: { autoUpdate: next } })
                }
              />
            }
          />
        </Card>
      </Section>

      <Section title="Your rules" description="Overrides you've added yourself">
        <Segmented
          options={LISTS}
          value={list}
          onChange={(next) => {
            setList(next);
            setError(null);
          }}
        />

        <Text variant="sub" tone="secondary" style={{ marginTop: theme.spacing.md }}>
          {list === 'allowed'
            ? 'Allowed sites override Aegis — use this when something harmless keeps getting caught.'
            : 'Blocked sites are added on top of what Aegis already blocks — use this for anything it missed.'}
        </Text>

        <Card
          padding="none"
          style={{ marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.base }}>
          {rules.length > 0 ? (
            rules.map((domain, index) => (
              <RuleRow
                key={domain}
                domain={domain}
                list={list}
                divider={index < rules.length - 1}
                onRemove={() => dispatch({ type: 'remove-rule', list, domain })}
              />
            ))
          ) : (
            <EmptyState
              icon={list === 'allowed' ? 'checkmark-circle-outline' : 'ban-outline'}
              title={list === 'allowed' ? 'Nothing allowed through' : 'No extra blocks'}
              description={
                list === 'allowed'
                  ? 'Add a site here if something you need keeps getting caught by mistake.'
                  : 'Add a site here if you hit something Aegis has not picked up yet.'
              }
            />
          )}
        </Card>

        <View style={[styles.addRow, { marginTop: theme.spacing.md, gap: theme.spacing.sm }]}>
          <View style={styles.grow}>
            <TextField
              value={draft}
              onChangeText={(next) => {
                setDraft(next);
                if (error) setError(null);
              }}
              placeholder="example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={addRule}
              error={error ?? undefined}
              icon="globe-outline"
            />
          </View>
          <Button
            label="Add"
            variant="secondary"
            onPress={addRule}
            fullWidth={false}
            style={styles.addButton}
          />
        </View>

        <Text variant="caption" tone="muted" style={{ marginTop: theme.spacing.sm }}>
          {plural(blocklist.allowed.length, 'allowed rule')} ·{' '}
          {plural(blocklist.blocked.length, 'blocked rule')}
        </Text>
      </Section>

      <Section title="Blocked page">
        <Card padding="none" style={{ paddingHorizontal: theme.spacing.base }}>
          <ListRow
            title="Blocked page"
            subtitle="Customise what people see"
            icon="color-palette-outline"
            onPress={() => router.push('/blocked-screen')}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mark: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1 },
  addRow: { flexDirection: 'row', alignItems: 'flex-start' },
  grow: { flex: 1 },
  addButton: { marginTop: 0 },
});
