import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { initialsFrom } from '@/lib/format';
import { useAppState } from '@/store/app-store';
import { useTheme } from '@/theme';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

/** The dashboard's own header: a greeting instead of a title bar. */
export function GreetingHeader() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAppState();

  const name = user?.name ?? '';
  const firstName = name.split(' ')[0] || 'there';
  const initials = user?.initials ?? (name ? initialsFrom(name) : 'A');

  return (
    <View style={[styles.row, { gap: theme.spacing.md }]}>
      <View style={styles.text}>
        <Text variant="sub" tone="secondary">
          {greetingFor(new Date().getHours())}
        </Text>
        <Text variant="h1" numberOfLines={1}>
          {firstName}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        hitSlop={10}
        onPress={() => router.push('/settings/profile')}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}>
        <Avatar initials={initials} size={44} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 },
});
