import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Rendered above the scroll area; usually `<Header />`. It owns the top inset. */
  header?: ReactNode;
  /** `scroll` is the default; use `fixed` when the screen owns its own list. */
  mode?: 'scroll' | 'fixed';
  /** Pinned to the bottom above the safe area — primary actions live here. */
  footer?: ReactNode;
  /** Remove the default horizontal padding (full-bleed screens). */
  bleed?: boolean;
  /** Use the alt background — grouped settings-style screens. */
  alt?: boolean;
  /** Extra bottom padding, e.g. to clear a floating tab bar. */
  bottomInset?: number;
  contentStyle?: ViewStyle;
  /** Rendered behind the content, edge to edge (gradients, glows). */
  backdrop?: ReactNode;
};

/**
 * Every screen starts here. It owns safe-area insets, the page background, the
 * reading-width clamp on tablets, and keyboard avoidance — so no screen has to.
 */
export function Screen({
  children,
  header,
  mode = 'scroll',
  footer,
  bleed = false,
  alt = false,
  bottomInset = 0,
  contentStyle,
  backdrop,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding = bleed ? 0 : theme.layout.screenPadding;
  const background = alt ? theme.colors.backgroundAlt : theme.colors.background;

  const inner = (
    <View
      style={[
        styles.clamp,
        { maxWidth: theme.layout.maxContentWidth, paddingHorizontal: padding },
        contentStyle,
      ]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {backdrop}
      {header}

      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 44}>
        {mode === 'scroll' ? (
          <ScrollView
            style={styles.root}
            contentContainerStyle={[
              styles.scrollContent,
              {
                // Without a header the screen owns the top inset itself.
                paddingTop: header ? theme.spacing.sm : insets.top + theme.spacing.sm,
                paddingBottom: theme.spacing['2xl'] + bottomInset + insets.bottom,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {inner}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.root,
              { paddingTop: header ? theme.spacing.sm : insets.top + theme.spacing.sm },
            ]}>
            {inner}
          </View>
        )}

        {footer ? (
          <View
            style={[
              styles.footer,
              {
                paddingHorizontal: theme.layout.screenPadding,
                paddingTop: theme.spacing.md,
                paddingBottom: Math.max(insets.bottom, theme.spacing.base) + bottomInset,
                backgroundColor: background,
                borderTopColor: theme.colors.border,
              },
            ]}>
            <View style={[styles.footerClamp, { maxWidth: theme.layout.maxContentWidth }]}>
              {footer}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  /** Scroll content: `flex: 1` lets a screen spread its children down the page. */
  clamp: { width: '100%', alignSelf: 'center', flex: 1 },
  /**
   * The footer measures itself from its content, so it must NOT use `clamp`:
   * `flex: 1` implies `flexBasis: 0`, and with no free space to grow into the
   * row would collapse to zero height and the button would hang off-screen.
   */
  footerClamp: { width: '100%', alignSelf: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
