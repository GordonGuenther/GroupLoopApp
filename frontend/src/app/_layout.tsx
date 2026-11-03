import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { InvitationPrompt } from '@/components/invitation-prompt';
import { useMessagePushRegistration } from '@/db/push-notifications';
import { useSync } from '@/db/sync';

SplashScreen.preventAutoHideAsync();

function useNotificationTapNavigation() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    let subscription: { remove: () => void } | undefined;
    let notifications: typeof import('expo-notifications') | undefined;

    const redirect = (response: import('expo-notifications').NotificationResponse) => {
      const entryId = response.notification.request.content.data?.entryId;
      if (typeof entryId !== 'string' || entryId.length === 0) return;
      router.push({ pathname: '/calendar/[id]', params: { id: entryId } });
      notifications?.clearLastNotificationResponse();
    };

    import('expo-notifications').then((module) => {
      if (!active) return;
      notifications = module;
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      const lastResponse = module.getLastNotificationResponse();
      if (lastResponse) redirect(lastResponse);
      subscription = module.addNotificationResponseReceivedListener(redirect);
    });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useSync();
  useMessagePushRegistration();
  useNotificationTapNavigation();
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
