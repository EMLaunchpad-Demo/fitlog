import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useStore } from '@/store/store';
import { palettes } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** True once the persisted store has been loaded from AsyncStorage. */
function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = dark ? palettes.dark : palettes.light;
  const hydrated = useHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.accent,
      background: c.bg,
      card: c.bgTop,
      text: c.text,
      border: c.border,
    },
  };

  return (
    <KeyboardProvider>
      <ThemeProvider value={theme}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: c.bg },
            // Matches the top of the green background gradient, so header and screen blend.
            headerStyle: { backgroundColor: c.bgTop },
            headerTintColor: c.accent,
            headerTitleStyle: { color: c.text, fontWeight: '700' },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
          }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="workout"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false, title: 'Training' }}
          />
          <Stack.Screen name="exercises" options={{ presentation: 'modal', title: 'Oefeningen' }} />
          <Stack.Screen name="food-add" options={{ presentation: 'modal', title: 'Toevoegen' }} />
          <Stack.Screen name="goals" options={{ presentation: 'modal', title: 'Instellingen' }} />
          <Stack.Screen name="weight" options={{ presentation: 'modal', title: 'Gewicht' }} />
          <Stack.Screen name="sleep" options={{ presentation: 'modal', title: 'Slaap' }} />
          <Stack.Screen name="cardio" options={{ presentation: 'modal', title: 'Cardio & stappen' }} />
          <Stack.Screen name="checkin" options={{ presentation: 'modal', title: 'Check-in' }} />
          <Stack.Screen name="phase" options={{ presentation: 'modal', title: 'Fase' }} />
          <Stack.Screen name="body" options={{ presentation: 'modal', title: 'Lichaamsmaten' }} />
          <Stack.Screen name="menu" options={{ title: 'Weekmenu' }} />
          <Stack.Screen name="scan" options={{ presentation: 'modal', title: 'Barcode scannen' }} />
          <Stack.Screen name="setup" options={{ presentation: 'modal', title: 'Persoonlijke setup' }} />
          <Stack.Screen name="plans" options={{ title: 'Schema’s' }} />
          <Stack.Screen name="guide" options={{ title: 'Onderbouwing' }} />
          <Stack.Screen name="history/[id]" options={{ title: 'Training' }} />
          <Stack.Screen name="exercise/[id]" options={{ title: 'Oefening' }} />
          <Stack.Screen name="plan/[id]" options={{ title: 'Schema' }} />
          <Stack.Screen name="coach" options={{ title: 'Coach' }} />
          <Stack.Screen
            name="coach-settings"
            options={{ presentation: 'modal', title: 'Coach-instellingen' }}
          />
        </Stack>
      </ThemeProvider>
    </KeyboardProvider>
  );
}
