import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getClient, useSessions } from '@/auth';

import { getDatabase } from './database';
import { useBackends, type Backend } from './settings';

export const MESSAGE_REMINDER_CHANNEL = 'calendar-reminders';

let deviceIdPromise: Promise<string> | undefined;

async function getDeviceId() {
  deviceIdPromise ??= (async () => {
    const db = await getDatabase();
    const existing = await db.getLocal<{ deviceId: string }>('android-push-device');
    if (existing) return existing.get('deviceId');
    const deviceId = Crypto.randomUUID();
    await db.upsertLocal('android-push-device', { deviceId });
    return deviceId;
  })();
  return deviceIdPromise;
}

/**
 * Registers this Android installation with one authenticated backend. The token is sent only
 * over the authenticated Supabase RPC; it is never stored in the replicated RxDB collections.
 */
export async function registerAndroidMessagePush(
  backend: Backend,
  requestPermission = true
): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error(
      'Push notifications need this app’s EAS project ID. Configure extra.eas.projectId in the Expo app config and rebuild the Android app.'
    );
  }

  const client = getClient(backend);
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('Sign in to this backend before enabling a Message reminder.');
  }

  const Notifications = await import('expo-notifications');
  await Notifications.setNotificationChannelAsync(MESSAGE_REMINDER_CHANNEL, {
    name: 'Calendar reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF7700',
  });

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && requestPermission && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    if (!requestPermission) return false;
    throw new Error(
      'Notification permission is off. Allow notifications in Android Settings → Apps → GroupLoop → Notifications, then try again.'
    );
  }

  let token: string;
  try {
    token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
  } catch (error) {
    throw new Error(
      `Could not obtain an Expo push token. Check the EAS project ID, Firebase google-services.json configuration, and Android FCM setup, then rebuild the app. ${String(error)}`
    );
  }

  const { error } = await client.rpc('register_calendar_message_push_device', {
    p_device_id: await getDeviceId(),
    p_expo_push_token: token,
  });
  if (error) {
    if (error.message.includes('ANDROID_PUSH_NOT_CONFIGURED')) {
      throw new Error(
        `Android push is not configured on “${backend.name}”. An administrator must configure the EAS Android FCM v1 credential and mark push as ready using the setup instructions.`
      );
    }
    if (error.code === 'PGRST202' || error.message.includes('register_calendar_message_push_device')) {
      throw new Error(
        `Backend “${backend.name}” is missing the Android push migration. Apply the latest backend migrations and try again.`
      );
    }
    throw new Error(`Could not register this device with “${backend.name}”: ${error.message}`);
  }
  return true;
}

/** Removes this installation's registration before a user disconnects from a backend. */
export async function unregisterAndroidMessagePush(backend: Backend) {
  if (Platform.OS !== 'android') return;
  const deviceId = await getDeviceId();
  const client = getClient(backend);
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const { error } = await client.rpc('unregister_calendar_message_push_device', {
    p_device_id: deviceId,
  });
  if (error) throw error;
}

/**
 * Keeps tokens current on each signed-in backend where this user's synced settings contain
 * Message reminders. It never prompts for permission during app startup.
 */
export function useMessagePushRegistration() {
  const backends = useBackends()?.backends;
  const sessions = useSessions(backends);
  const signature = JSON.stringify(
    backends?.map((backend) => ({
      id: backend.id,
      backendUrl: backend.backendUrl,
      apiKey: backend.apiKey,
      userId: sessions?.[backend.id]?.user.id,
    }))
  );

  useEffect(() => {
    if (Platform.OS !== 'android' || !backends || !sessions) return;
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;

    getDatabase().then((db) => {
      if (cancelled) return;
      subscription = db.calendar_entry_settings.find().$.subscribe((settings) => {
        const targets = backends.filter((backend) => {
          const userId = sessions[backend.id]?.user.id;
          return (
            !!userId &&
            settings.some(
              (setting) =>
                setting.backend_id === backend.id &&
                setting.user_id === userId &&
                setting.notifications.some((value) => value.endsWith(':message'))
            )
          );
        });
        for (const backend of targets) {
          registerAndroidMessagePush(backend, false).catch((error) =>
            console.warn(`Push registration with ${backend.name} failed:`, error)
          );
        }
      });
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
}
