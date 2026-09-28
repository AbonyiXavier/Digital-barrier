import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/theme';

/** Route name → the icon pair and label shown in the bar. */
const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Home', icon: 'home-outline', iconActive: 'home' },
  protection: { label: 'Protection', icon: 'shield-outline', iconActive: 'shield' },
  accountability: { label: 'Partner', icon: 'people-outline', iconActive: 'people' },
  devices: { label: 'Devices', icon: 'phone-portrait-outline', iconActive: 'phone-portrait' },
  settings: { label: 'Settings', icon: 'settings-outline', iconActive: 'settings' },
};

/**
 * A floating, blurred tab bar. Content scrolls under it, which is why every
 * tab screen passes `bottomInset={TAB_BAR_CLEARANCE}` to `<Screen />`.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrapper,
        {
          paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          paddingHorizontal: theme.spacing.base,
        },
      ]}
      pointerEvents="box-none">
      <View
        style={[
          styles.bar,
          theme.shadows.lg,
          {
            borderRadius: theme.radius.xl,
            borderColor: theme.colors.chromeBorder,
            // Blur is iOS-only in practice; elsewhere fall back to a solid fill.
            backgroundColor: Platform.OS === 'ios' ? 'transparent' : theme.colors.chrome,
          },
        ]}>
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={60}
            tint={theme.isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.chrome }]}
          />
        ) : null}

        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (focused || event.defaultPrevented) return;
            if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={onPress}
              style={styles.item}>
              <Icon
                name={focused ? tab.iconActive : tab.icon}
                size={22}
                color={focused ? theme.colors.brand : theme.colors.textMuted}
              />
              <Text
                variant="micro"
                style={{ color: focused ? theme.colors.brand : theme.colors.textMuted }}
                numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Bottom padding a tab screen needs so its last row clears the floating bar. */
export const TAB_BAR_CLEARANCE = 84;

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
