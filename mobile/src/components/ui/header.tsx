import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

export type HeaderProps = {
  title?: string;
  subtitle?: string;
  /** Show a back chevron. Defaults to true on any screen that can go back. */
  onBack?: (() => void) | false;
  /** Right-hand slot: a button, a badge, anything. */
  right?: ReactNode;
  /** Large iOS-style title stacked under the bar instead of centred in it. */
  large?: boolean;
};

/**
 * Screens draw their own header rather than using the native one, so the title,
 * back affordance and right-hand actions share the app's type scale everywhere.
 */
export function Header({ title, subtitle, onBack, right, large = false }: HeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const showBack = onBack !== false;
  const handleBack = () => {
    if (typeof onBack === 'function') onBack();
    else if (router.canGoBack()) router.back();
  };

  return (
    <View style={{ paddingTop: insets.top + theme.spacing.sm }}>
      <View style={[styles.bar, { paddingHorizontal: theme.layout.screenPadding }]}>
        <View style={styles.side}>
          {showBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: theme.colors.surfaceAlt,
                  borderRadius: theme.radius.full,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Icon name="chevron-back" size={20} color={theme.colors.text} />
            </Pressable>
          ) : null}
        </View>

        {!large && title ? (
          <Text variant="bodyStrong" numberOfLines={1} style={styles.centerTitle}>
            {title}
          </Text>
        ) : (
          <View style={styles.centerTitle} />
        )}

        <View style={[styles.side, styles.right]}>{right}</View>
      </View>

      {large && title ? (
        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xs,
          }}>
          <Text variant="h1">{title}</Text>
          {subtitle ? (
            <Text variant="sub" tone="secondary" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  side: { width: 76, justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  centerTitle: { flex: 1, textAlign: 'center' },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
