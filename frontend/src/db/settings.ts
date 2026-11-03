import { useEffect, useState } from 'react';
import { combineLatest, firstValueFrom, map } from 'rxjs';

import { getDatabase, INITIAL_BACKEND_ID } from './database';

export const DEFAULT_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';
export const DEFAULT_API_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export type Backend = {
  id: string;
  /** Shown in the app to tell backends apart. */
  name: string;
  backendUrl: string;
  apiKey: string;
};

/** Entries without groups are saved on the default backend. */
export type Backends = { backends: Backend[]; defaultId: string };

// Settings are local documents: stored on this device only, never synced.
const BACKENDS_ID = 'backends';
// The only backend before several could be connected.
const LEGACY_SETTINGS_ID = 'settings';

type LegacySettings = { backendUrl?: string; apiKey?: string };

const backends$ = async () => {
  const db = await getDatabase();
  return combineLatest([
    db.getLocal$<Backends>(BACKENDS_ID),
    db.getLocal$<LegacySettings>(LEGACY_SETTINGS_ID),
  ]).pipe(
    map(([doc, legacy]): Backends => {
      if (doc) return { backends: doc.get('backends'), defaultId: doc.get('defaultId') };
      return {
        backends: [
          {
            id: INITIAL_BACKEND_ID,
            name: 'Default',
            backendUrl: legacy?.get('backendUrl') ?? DEFAULT_BACKEND_URL,
            apiKey: legacy?.get('apiKey') ?? DEFAULT_API_KEY,
          },
        ],
        defaultId: INITIAL_BACKEND_ID,
      };
    })
  );
};

/** The backends set on this device, or the build's default. `undefined` while loading. */
export function useBackends() {
  const [backends, setBackends] = useState<Backends>();

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    backends$().then((backends) => {
      if (cancelled) return;
      subscription = backends.subscribe(setBackends);
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  return backends;
}

export async function getBackends() {
  return firstValueFrom(await backends$());
}

export async function saveBackends(backends: Backends) {
  const db = await getDatabase();
  await db.upsertLocal<Backends>(BACKENDS_ID, backends);
}
