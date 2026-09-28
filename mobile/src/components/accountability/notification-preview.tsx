import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Card, Icon, Text } from '@/components/ui';
import { APP_NAME } from '@/lib/app';
import { useTheme } from '@/theme';

type NotificationPreviewProps = {
  /** The name the partner will see in the message. */
  userName: string;
  /** First name of the person being invited, once it has been typed. */
  partnerName?: string;
};

/**
 * Exactly what lands on the other person's phone. Reading the message before
 * sending it is what makes an invitation easy to send.
 */
export function NotificationPreview({ userName, partnerName }: NotificationPreviewProps) {
  const theme = useTheme();

  return (
    <Card variant="outlined" padding="base">
      <View
        style={[
          styles.notification,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}>
        <View style={[styles.head, { gap: theme.spacing.sm }]}>
          <View style={[styles.appIcon, { borderRadius: theme.radius.xs }]}>
            <LinearGradient
              colors={theme.colors.brandGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Icon name="shield-checkmark" size={12} color={theme.colors.textOnAccent} />
          </View>

          <Text variant="label" tone="muted" style={styles.flex}>
            {APP_NAME}
          </Text>
          <Text variant="micro" tone="muted">
            now
          </Text>
        </View>

        <Text variant="bodyStrong">
          {userName} has asked you to be their accountability partner
        </Text>
        <Text variant="sub" tone="secondary">
          {partnerName ? `${partnerName}, they` : 'They'} chose you to stand with them on a
          promise they made themselves. Tap to accept or decline.
        </Text>
      </View>

      <View style={[styles.promise, { gap: theme.spacing.sm, marginTop: theme.spacing.md }]}>
        <Icon name="lock-closed" size={14} color={theme.colors.shield} />
        <Text variant="caption" tone="secondary" style={styles.flex}>
          The invitation also tells them what they will never see: your browsing history, your
          searches, or anything you read.
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  notification: { width: '100%' },
  head: { flexDirection: 'row', alignItems: 'center' },
  appIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  promise: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
});
