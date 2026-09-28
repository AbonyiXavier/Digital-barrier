import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FilterProvider } from '@/lib/filter';
import { AppStoreProvider, useAppState } from '@/store/app-store';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Screens draw their own `<Header />`, so every route here hides the native one.
 * Sheets that interrupt a flow (disabling protection, adding a device, paying)
 * are presented as modals so the screen underneath stays in view.
 */
function RootNavigator() {
  const theme = useTheme();
  const { hydrated } = useAppState();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  // Holding the splash until persisted state is read avoids a flash of the
  // onboarding screen for someone who already finished it.
  if (!hydrated) return null;

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />

        <Stack.Screen name="protection/level" />
        <Stack.Screen name="protection/lock" />
        <Stack.Screen name="protection/disable" options={{ presentation: 'modal' }} />

        <Stack.Screen name="accountability/invite" options={{ presentation: 'modal' }} />
        <Stack.Screen name="accountability/requests" />
        <Stack.Screen name="accountability/approval-settings" />

        <Stack.Screen name="devices/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="devices/[id]" />

        <Stack.Screen name="blocklist" />
        <Stack.Screen name="blocked-screen" />
        <Stack.Screen name="subscription" options={{ presentation: 'modal' }} />

        <Stack.Screen name="settings/profile" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/privacy" />
        <Stack.Screen name="settings/support" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStoreProvider>
            <FilterProvider>
              <RootNavigator />
            </FilterProvider>
          </AppStoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
