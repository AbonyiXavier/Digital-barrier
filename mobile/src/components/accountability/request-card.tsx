import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, Text, type BadgeProps, type IconName } from '@/components/ui';
import { countdown, elapsedFraction, relativeTime } from '@/lib/format';
import { useTheme } from '@/theme';
import type { DisableRequest } from '@/types';

type RequestCardProps = {
  request: DisableRequest;
  /** Name of the partner the request went to, when it went to one. */
  partnerName: string | null;
  /** Ticking clock owned by the screen, so one timer serves every card. */
  now: number;
  onCancel: () => void;
};

function statusBadge(status: DisableRequest['status']): BadgeProps {
  switch (status) {
    case 'pending':
      return { label: 'Waiting', tone: 'warn', icon: 'hourglass-outline' };
    case 'approved':
      return { label: 'Approved', tone: 'neutral', icon: 'checkmark' };
    case 'declined':
      return { label: 'Declined', tone: 'danger', icon: 'close' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral', icon: 'time-outline' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral', icon: 'arrow-undo-outline' };
  }
}

export function RequestCard({ request, partnerName, now, onCancel }: RequestCardProps) {
  const theme = useTheme();

  const isDelay = request.method === 'delay';
  const pending = request.status === 'pending';
  const icon: IconName = isDelay ? 'time-outline' : 'person-outline';
  const accent = pending ? theme.colors.warn : theme.colors.textMuted;
  const remaining = countdown(request.resolvesAt, now);
  const progress = elapsedFraction(request.requestedAt, request.resolvesAt, now);

  return (
    <Card variant="outlined">
      <View style={[styles.head, { gap: theme.spacing.md }]}>
        <View
          style={[
            styles.chip,
            { backgroundColor: `${accent}22`, borderRadius: theme.radius.md },
          ]}>
          <Icon name={icon} size={19} color={accent} />
        </View>

        <View style={styles.flex}>
          <Text variant="bodyStrong">
            {isDelay ? 'Waiting period' : 'Partner approval'}
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
            Asked {relativeTime(request.requestedAt).toLowerCase()}
          </Text>
        </View>

        <Badge {...statusBadge(request.status)} />
      </View>

      <View
        style={[
          styles.quote,
          { borderLeftColor: theme.colors.border, marginTop: theme.spacing.base },
        ]}>
        <Text variant="sub" style={styles.italic}>
          “{request.reason}”
        </Text>
      </View>

      {pending && isDelay ? (
        <View style={{ marginTop: theme.spacing.base, gap: theme.spacing.sm }}>
          <View style={styles.countdownRow}>
            <Text variant="h3" tone="warn" rounded>
              {remaining === 'Ready' ? 'Waiting period over' : remaining}
            </Text>
            {remaining === 'Ready' ? null : (
              <Text variant="caption" tone="muted">
                until this can go through
              </Text>
            )}
          </View>

          <View
            style={[
              styles.track,
              { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.full },
            ]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.round(progress * 100)}%`,
                  backgroundColor: theme.colors.warn,
                  borderRadius: theme.radius.full,
                },
              ]}
            />
          </View>
        </View>
      ) : null}

      {pending && !isDelay ? (
        <Text variant="caption" tone="secondary" style={{ marginTop: theme.spacing.md }}>
          {partnerName
            ? `Waiting for ${partnerName} to answer. Protection stays on until they do.`
            : 'Waiting for your partner to answer. Protection stays on until they do.'}
        </Text>
      ) : null}

      {pending ? (
        <View style={{ marginTop: theme.spacing.base }}>
          <Button
            label="Cancel request"
            size="sm"
            variant="secondary"
            icon="arrow-undo-outline"
            fullWidth={false}
            onPress={onCancel}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  chip: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  quote: { borderLeftWidth: 2, paddingLeft: 12 },
  italic: { fontStyle: 'italic' },
  countdownRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  track: { height: 5, overflow: 'hidden' },
  fill: { height: 5 },
});
