import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { InvitationPrompt } from '@/components/invitation-prompt';
import { useSync } from '@/db/sync';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useSync();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="calendar/add"
          options={{ presentation: 'modal', headerShown: true, title: 'New entry' }}
        />
        <Stack.Screen name="calendar/[id]/index" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="calendar/[id]/edit"
          options={{ presentation: 'modal', headerShown: true, title: 'Edit entry' }}
        />
        <Stack.Screen
          name="groups/add"
          options={{ presentation: 'modal', headerShown: true, title: 'New group' }}
        />
        <Stack.Screen name="groups/[id]/index" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="groups/[id]/edit"
          options={{ presentation: 'modal', headerShown: true, title: 'Edit group' }}
        />
        <Stack.Screen
          name="groups/[id]/invite"
          options={{ presentation: 'modal', headerShown: true, title: 'Add members' }}
        />
      </Stack>
      <InvitationPrompt />
    </ThemeProvider>
  );
}
