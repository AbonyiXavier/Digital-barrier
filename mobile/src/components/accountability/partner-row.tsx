import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Button, Icon, ListRow, Text, type BadgeProps } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { useAppDispatch } from '@/store/app-store';
import { useTheme } from '@/theme';
import type { Partner } from '@/types';

type PartnerRowProps = {
  partner: Partner;
  /** True when this partner is the level-4 approver on the Protection Lock. */
  isApprover: boolean;
  expanded: boolean;
  onToggle: () => void;
};

function statusBadge(partner: Partner, isApprover: boolean): BadgeProps {
  if (isApprover) {
    return { label: 'Approver', tone: 'shield', variant: 'solid', icon: 'shield-checkmark' };
  }
  switch (partner.status) {
    case 'active':
      return { label: 'Active', tone: 'shield', icon: 'checkmark-circle' };
    case 'pending':
      return { label: 'Invite sent', tone: 'warn', icon: 'mail-outline' };
    case 'declined':
      return { label: 'Declined', tone: 'danger', icon: 'close-circle-outline' };
  }
}

/**
 * A partner, and — once opened — the two or three things you can do about them.
 * Destructive actions arm on the first tap and commit on the second, so nothing
 * here needs a system alert to interrupt the screen.
 */
export function PartnerRow({ partner, isApprover, expanded, onToggle }: PartnerRowProps) {
  const theme = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [armed, setArmed] = useState(false);
  const [resent, setResent] = useState(false);

  // An armed removal disarms itself, so a forgotten tap can never remove anyone.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  const badge = statusBadge(partner, isApprover);
  const firstName = partner.name.split(' ')[0] ?? partner.name;

  const remove = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    dispatch({ type: 'remove-partner', id: partner.id });
  };

  const removeLabel = partner.status === 'pending' ? 'Cancel invite' : 'Remove';

  return (
    <View>
      <ListRow
        leading={<Avatar initials={partner.initials} pending={partner.status !== 'active'} />}
        title={partner.name}
        subtitle={`${partner.relationship} · ${partner.email}`}
        onPress={onToggle}
        chevron={false}
        trailing={
          <View style={[styles.trailing, { gap: theme.spacing.sm }]}>
            <Badge {...badge} />
            <Icon
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={theme.colors.textMuted}
            />
          </View>
        }
      />

      {expanded ? (
        <View
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.background,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
              gap: theme.spacing.md,
              marginBottom: theme.spacing.md,
            },
          ]}>
          <Text variant="caption" tone="secondary">
            {partner.status === 'active'
              ? `In your corner since ${relativeTime(partner.invitedAt).toLowerCase()}.`
              : partner.status === 'pending'
                ? `Invited ${relativeTime(partner.invitedAt).toLowerCase()} — waiting for ${firstName} to accept.`
                : `${firstName} said no for now. You can ask again, or choose someone else.`}
          </Text>

          {isApprover ? (
            <Text variant="caption" tone="shield">
              {firstName} approves requests to turn protection off at protection level 4.
            </Text>
          ) : null}

          {resent ? (
            <Text variant="caption" tone="shield">
              Invite sent again just now.
            </Text>
          ) : null}

          {armed ? (
            <Text variant="caption" tone="danger">
              {isApprover
                ? `Removing ${firstName} also leaves protection level 4 without an approver.`
                : `${firstName} keeps nothing. Removing them simply ends their part.`}
            </Text>
          ) : null}

          <View style={[styles.actions, { gap: theme.spacing.sm }]}>
            {partner.status === 'active' ? (
              <View style={styles.flex}>
                <Button
                  label={isApprover ? 'Clear approver' : 'Make approver'}
                  size="sm"
                  variant="secondary"
                  icon={isApprover ? 'shield-outline' : 'shield-checkmark-outline'}
                  onPress={() =>
                    dispatch({
                      type: 'set-lock-partner',
                      partnerId: isApprover ? null : partner.id,
                    })
                  }
                />
              </View>
            ) : null}

            {partner.status === 'pending' ? (
              <View style={styles.flex}>
                <Button
                  label="Resend"
                  size="sm"
                  variant="secondary"
                  icon="paper-plane-outline"
                  onPress={() => setResent(true)}
                />
              </View>
            ) : null}

            {partner.status === 'declined' ? (
              <View style={styles.flex}>
                <Button
                  label="Invite again"
                  size="sm"
                  variant="secondary"
                  icon="person-add-outline"
                  onPress={() => router.push('/accountability/invite')}
                />
              </View>
            ) : null}

            <View style={styles.flex}>
              <Button
                label={armed ? 'Tap again' : removeLabel}
                size="sm"
                variant={armed ? 'danger' : 'secondary'}
                icon={armed ? 'alert-circle-outline' : 'close-circle-outline'}
                onPress={remove}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center' },
  panel: { width: '100%' },
  actions: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
