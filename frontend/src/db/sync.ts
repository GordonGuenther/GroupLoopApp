import { useEffect } from 'react';
import {
  replicateSupabase,
  type RxSupabaseReplicationState,
} from 'rxdb/plugins/replication-supabase';

import { getClient, useSessions } from '@/auth';
import { unregisterAndroidMessagePush } from '@/db/push-notifications';

import { getDatabase, REMOVED_BACKEND_ID } from './database';
import { type Backend, useBackends } from './settings';

/**
 * Sends arrays as Postgres array literals. RxDB's Supabase plugin compares every field with the
 * last known backend row before an update, and can only compare plain values.
 */
const toPostgresArrays = (doc: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(doc).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? `{${value.map((item) => JSON.stringify(String(item))).join(',')}}`
        : value,
    ])
  );

/** The running replications by backend id. */
const replications = new Map<string, RxSupabaseReplicationState<unknown>[]>();

// Collection names match the Supabase table names.
const TABLES = [
  'calendar_entries',
  'calendar_entry_settings',
  'groups',
  'group_members',
] as const;

async function cancel(backendId: string) {
  // Taken out right away, so that a restart can set the new ones meanwhile.
  const cancelled = replications.get(backendId) ?? [];
  replications.delete(backendId);
  await Promise.all(cancelled.map((replication) => replication.cancel()));
}

/** Syncs the local database with every backend the user is signed in to. */
export function useSync() {
  const backends = useBackends()?.backends;
  const sessions = useSessions(backends);
  const connected = backends?.flatMap((backend) => {
    const user = sessions?.[backend.id]?.user;
    // A new sign-in starts a fresh replication: it uploads everything created offline, and
    // the local wipe from the last disconnect is never pushed as deletions.
    return user ? [{ backend, userId: user.id, signInId: user.last_sign_in_at }] : [];
  });

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    getDatabase().then((db) => {
      if (cancelled) return;
      for (const { backend, userId, signInId } of connected) {
        replications.set(
          backend.id,
          TABLES.map((table) => {
            const replication = replicateSupabase<unknown>({
              collection: db[table],
              client: getClient(backend),
              tableName: table,
              replicationIdentifier: `${table} ${backend.backendUrl} ${userId} ${signInId}`,
              pull: { modifier: (row) => ({ ...row, backend_id: backend.id }) },
              // Each backend only gets its own rows, without the local backend id.
              push: {
                modifier: (doc) => {
                  const { backend_id, ...row } = doc as Record<string, unknown>;
                  return backend_id === backend.id ? toPostgresArrays(row) : null;
                },
              },
            });
            // RxDB retries failed pushes and pulls silently.
            replication.error$.subscribe((error) =>
              console.warn(`Sync of ${table} with ${backend.name} failed:`, error)
            );
            return replication;
          })
        );
      }
    });
    return () => {
      cancelled = true;
      [...replications.keys()].forEach(cancel);
    };
  }, [JSON.stringify(connected)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Signs out of a backend and removes its data from the device. They stay on the backend. */
export async function disconnect(backend: Backend) {
  // Stop syncing first, so the local wipe does not reach the backend.
  await cancel(backend.id);
  try {
    await unregisterAndroidMessagePush(backend);
  } catch (error) {
    console.warn(`Could not remove push registration from ${backend.name}:`, error);
  }
  await getClient(backend).auth.signOut();
  const db = await getDatabase();
  // Removed documents stay as deleted ones. Moved off the backend first, no replication
  // pushes them, not even the next sign-in's.
  await Promise.all(
    TABLES.map(async (table) => {
      const query = db[table].find({ selector: { backend_id: backend.id } });
      await query.patch({ backend_id: REMOVED_BACKEND_ID });
      await db[table].find({ selector: { backend_id: REMOVED_BACKEND_ID } }).remove();
    })
  );
}
