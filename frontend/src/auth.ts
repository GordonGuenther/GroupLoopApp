import 'react-native-url-polyfill/auto';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getDatabase, INITIAL_BACKEND_ID } from '@/db/database';
import type { Backend } from '@/db/settings';

// The session is a local document too, so the app stays signed in across restarts.
const storage = {
  getItem: async (key: string) =>
    (await (await getDatabase()).getLocal<{ value: string }>(key))?.get('value') ?? null,
  setItem: async (key: string, value: string) => {
    await (await getDatabase()).upsertLocal(key, { value });
  },
  removeItem: async (key: string) => {
    await (await (await getDatabase()).getLocal(key))?.remove();
  },
};

const clientId = ({ id, backendUrl, apiKey }: Backend) => `${id} ${backendUrl} ${apiKey}`;

const clients = new Map<string, SupabaseClient>();

/** The Supabase client for a backend. Created on first use. */
export function getClient(backend: Backend) {
  const id = clientId(backend);
  let client = clients.get(id);
  if (!client) {
    client = createClient(backend.backendUrl, backend.apiKey, {
      auth: {
        storage,
        // Supabase derives the default key from the host, which backends may share. The initial
        // backend keeps it, so it stays signed in. Left out, as `undefined` would replace it.
        ...(backend.id !== INITIAL_BACKEND_ID && { storageKey: `sb-${backend.id}-auth-token` }),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    clients.set(id, client);
  }
  return client;
}

type Sessions = Record<string, Session | null>;

/**
 * The signed-in session per backend id, `null` if signed out. `undefined` while loading.
 */
export function useSessions(backends: Backend[] | undefined) {
  const [state, setState] = useState<{ id: string; sessions: Sessions }>();
  const id = backends?.map(clientId).join('\n');

  useEffect(() => {
    if (!backends || id === undefined) return;
    const sessions: Sessions = {};
    // Once every backend's session is known.
    const update = () => {
      if (backends.every((backend) => backend.id in sessions)) {
        setState({ id, sessions: { ...sessions } });
      }
    };
    const subscriptions = backends.map((backend) => {
      if (!backend.apiKey) {
        sessions[backend.id] = null;
        return undefined;
      }
      const auth = getClient(backend).auth;
      auth.getSession().then(({ data }) => {
        // An auth event may have come first, and is newer.
        if (!(backend.id in sessions)) sessions[backend.id] = data.session;
        update();
      });
      const { data } = auth.onAuthStateChange((_event, session) => {
        sessions[backend.id] = session;
        update();
      });
      return data.subscription;
    });
    update();
    return () => subscriptions.forEach((subscription) => subscription?.unsubscribe());
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return state?.id === id ? state?.sessions : undefined;
}

/** Emails a one-time sign-in code. Creates the account on first use. */
export async function sendCode(backend: Backend, email: string) {
  const { error } = await getClient(backend).auth.signInWithOtp({ email });
  if (error) throw error;
}

/** Signs in with the code from the email. */
export async function verifyCode(backend: Backend, email: string, token: string) {
  const { error } = await getClient(backend).auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}
