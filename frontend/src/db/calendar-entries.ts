import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { map } from 'rxjs';

import { getDatabase, type CalendarEntry, type CalendarEntrySettings } from './database';
import { useGroups, useUsers } from './groups';
import { getBackends } from './settings';

/** The user's own entries and those of their groups, earliest start first. `undefined` while loading. */
export function useCalendarEntries() {
  const [entries, setEntries] = useState<CalendarEntry[]>();
  const users = useUsers();
  const groups = useGroups();

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    getDatabase().then((db) => {
      if (cancelled) return;
      subscription = db.calendar_entries
        .find({ sort: [{ starts_at: 'asc' }] })
        .$.subscribe((docs) => setEntries(docs.map((doc) => doc.toJSON() as CalendarEntry)));
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  if (!entries || !groups || !users) return undefined;
  // Entries of a group the user left stay on the device. Own entries have no user until synced.
  const groupIds = new Set(groups.map((group) => group.id));
  return entries.filter(
    (entry) =>
      !entry.user_id ||
      entry.user_id === users[entry.backend_id]?.id ||
      entry.group_ids.some((id) => groupIds.has(id))
  );
}

/** One entry, `null` if it does not exist. `undefined` while loading. */
export function useCalendarEntry(id: string) {
  const [entry, setEntry] = useState<CalendarEntry | null>();

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    getDatabase().then((db) => {
      if (cancelled) return;
      subscription = db.calendar_entries
        .findOne(id)
        .$.pipe(map((doc) => (doc?.toJSON() as CalendarEntry | undefined) ?? null))
        .subscribe(setEntry);
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [id]);

  return entry;
}

/**
 * Whether the user may edit an entry: they created it, or they are a full member of an
 * attached group. Entries without a user were created on this device and are not synced yet.
 */
export function canEditEntry(
  entry: CalendarEntry,
  userId: string | undefined,
  fullGroupIds: Set<string>
) {
  return (
    !entry.user_id ||
    entry.user_id === userId ||
    entry.group_ids.some((id) => fullGroupIds.has(id))
  );
}

export type CalendarEntryValues = {
  title: string;
  start: Date;
  end: Date;
  groupIds: string[];
};

/** The backend of an entry's groups. They are all on the same one. `undefined` without groups. */
async function groupsBackendId(groupIds: string[]) {
  if (groupIds.length === 0) return undefined;
  const db = await getDatabase();
  return (await db.groups.findOne(groupIds[0]).exec())?.backend_id;
}

const toFields = (entry: CalendarEntryValues) => ({
  title: entry.title,
  starts_at: entry.start.toISOString(),
  ends_at: entry.end.toISOString(),
  group_ids: entry.groupIds,
});

/** Saves the entry on the backend of its groups, or on the default backend without groups. */
export async function addCalendarEntry(
  entry: CalendarEntryValues,
  notifications: EntryNotification[]
) {
  const db = await getDatabase();
  const doc = await db.calendar_entries.insert({
    id: Crypto.randomUUID(),
    backend_id: (await groupsBackendId(entry.groupIds)) ?? (await getBackends()).defaultId,
    ...toFields(entry),
  });
  if (notifications.length > 0) await setNotifications(doc.id, doc.backend_id, notifications);
}

/**
 * Updates an entry, and returns its id. Shared with groups on another backend, it moves there
 * with a new id: reusing the id could overwrite the deletion before it reaches the old backend.
 */
export async function updateCalendarEntry(id: string, entry: CalendarEntryValues) {
  const db = await getDatabase();
  const doc = await db.calendar_entries.findOne(id).exec();
  if (!doc) return id;
  const backendId = (await groupsBackendId(entry.groupIds)) ?? doc.backend_id;
  if (backendId === doc.backend_id) {
    await doc.patch(toFields(entry));
    return id;
  }
  const moved = await db.calendar_entries.insert({
    id: Crypto.randomUUID(),
    backend_id: backendId,
    ...toFields(entry),
  });
  // The user's own notifications move along. Other members are not on the new backend.
  const settings = await db.calendar_entry_settings.find({ selector: { entry_id: id } }).exec();
  const notifications = toNotifications(settings);
  if (notifications.length > 0) await setNotifications(moved.id, backendId, notifications);
  await doc.remove();
  return moved.id;
}

/** Deletes an entry for everyone who sees it. */
export async function deleteCalendarEntry(id: string) {
  const db = await getDatabase();
  await (await db.calendar_entries.findOne(id).exec())?.remove();
}

export type NotificationMethod = 'message' | 'alarm';

/** A reminder of the user's own, some minutes before an entry starts. */
export type EntryNotification = { minutes: number; method: NotificationMethod };

/**
 * The notifications of the user's settings on an entry, earliest first. Settings made on two
 * devices before they synced are two documents, and count together.
 */
function toNotifications(settings: CalendarEntrySettings[]) {
  const values = [...new Set(settings.flatMap((doc) => doc.notifications))];
  return values
    .map((value): EntryNotification => {
      const [minutes, method] = value.split(':');
      return { minutes: Number(minutes), method: method as NotificationMethod };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

/** The user's own notifications for an entry, earliest first. `undefined` while loading. */
export function useNotifications(entryId: string) {
  const [notifications, setLoaded] = useState<EntryNotification[]>();

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    getDatabase().then((db) => {
      if (cancelled) return;
      subscription = db.calendar_entry_settings
        .find({ selector: { entry_id: entryId } })
        .$.subscribe((docs) =>
          setLoaded(
            toNotifications(docs.map((doc) => doc.toJSON() as CalendarEntrySettings))
          )
        );
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [entryId]);

  return notifications;
}

/** Replaces the user's own notifications for an entry, saved on the entry's backend. */
export async function setNotifications(
  entryId: string,
  backendId: string,
  notifications: EntryNotification[]
) {
  const db = await getDatabase();
  const values = [
    ...new Set(notifications.map((notification) => `${notification.minutes}:${notification.method}`)),
  ];
  const [doc, ...duplicates] = await db.calendar_entry_settings
    .find({ selector: { entry_id: entryId } })
    .exec();
  if (doc) await doc.patch({ notifications: values });
  else
    await db.calendar_entry_settings.insert({
      id: Crypto.randomUUID(),
      backend_id: backendId,
      entry_id: entryId,
      notifications: values,
    });
  // Settings from another device are merged into the saved ones.
  await Promise.all(duplicates.map((duplicate) => duplicate.remove()));
}
