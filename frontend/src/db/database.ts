import {
  addRxPlugin,
  createRxDatabase,
  type RxCollection,
  type RxDatabase,
  type RxJsonSchema,
} from 'rxdb';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election';
import { RxDBLocalDocumentsPlugin } from 'rxdb/plugins/local-documents';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

import { platformOptions } from './platform';

addRxPlugin(RxDBCleanupPlugin);
// The cleanup waits for leadership on web. The replications add it too, but not while signed out.
addRxPlugin(RxDBLeaderElectionPlugin);
addRxPlugin(RxDBLocalDocumentsPlugin);
addRxPlugin(RxDBMigrationSchemaPlugin);

/** The backend that was the only one before several could be connected. */
export const INITIAL_BACKEND_ID = 'initial';

/** Rows that were on a backend the user disconnected from. No replication pushes them. */
export const REMOVED_BACKEND_ID = 'removed';

/** Local only, never sent to the backend: the backend the row lives on. */
const backendIdProperty = { type: 'string', maxLength: 36 } as const;

/** Rows from before several backends could be connected. */
const toInitialBackend = (doc: Record<string, unknown>) => ({
  ...doc,
  backend_id: INITIAL_BACKEND_ID,
});

/** Field names match the columns of the `calendar_entries` table in Supabase. */
export type CalendarEntry = {
  id: string;
  backend_id: string;
  /** Set by the backend on first sync. */
  user_id?: string;
  title: string;
  /** ISO 8601 timestamps. */
  starts_at: string;
  ends_at: string;
  /** Groups the entry is shared with. Their members see it. */
  group_ids: string[];
};

export const calendarEntrySchema: RxJsonSchema<CalendarEntry> = {
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    backend_id: backendIdProperty,
    user_id: { type: 'string' },
    title: { type: 'string' },
    starts_at: { type: 'string', format: 'date-time', maxLength: 40 },
    ends_at: { type: 'string', format: 'date-time' },
    group_ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'backend_id', 'title', 'starts_at', 'ends_at', 'group_ids'],
  indexes: ['starts_at'],
};

/** Field names match the columns of the `calendar_entry_settings` table in Supabase. */
export type CalendarEntrySettings = {
  id: string;
  backend_id: string;
  entry_id: string;
  /** Set by the backend on first sync. Only the user's own settings are on the device. */
  user_id?: string;
  /** `<minutes before the start>:<message|alarm>`, e.g. `15:message`. */
  notifications: string[];
};

export const calendarEntrySettingsSchema: RxJsonSchema<CalendarEntrySettings> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    backend_id: backendIdProperty,
    entry_id: { type: 'string', maxLength: 36 },
    user_id: { type: 'string' },
    notifications: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'backend_id', 'entry_id', 'notifications'],
  indexes: ['entry_id'],
};

/** Field names match the columns of the `groups` table in Supabase. */
export type Group = {
  id: string;
  backend_id: string;
  /** Set by the backend on first sync. */
  created_by?: string;
  name: string;
  /** Hex color, e.g. `#ff7700`. */
  color: string;
  /** `default:<n>` for one of the built-in images. */
  image: string;
};

export const groupSchema: RxJsonSchema<Group> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    backend_id: backendIdProperty,
    created_by: { type: 'string' },
    name: { type: 'string' },
    color: { type: 'string' },
    image: { type: 'string' },
  },
  required: ['id', 'backend_id', 'name', 'color', 'image'],
};

/** Field names match the columns of the `group_members` table in Supabase. */
export type GroupMember = {
  /** `<group_id>:<user_id>` for the creator, random for invitations. */
  id: string;
  backend_id: string;
  group_id: string;
  /** Set when the invitee accepts. */
  user_id?: string;
  email?: string;
  /** Full members may change the group and its members, read members only see it. */
  role: 'full' | 'read';
  /** Pending until the invitee accepts. */
  status: 'active' | 'pending';
  invited_by_email?: string;
};

export const groupMemberSchema: RxJsonSchema<GroupMember> = {
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 80 },
    backend_id: backendIdProperty,
    group_id: { type: 'string', maxLength: 36 },
    user_id: { type: 'string' },
    email: { type: 'string' },
    role: { type: 'string', enum: ['full', 'read'] },
    status: { type: 'string', enum: ['active', 'pending'] },
    invited_by_email: { type: 'string' },
  },
  required: ['id', 'backend_id', 'group_id', 'role', 'status'],
  indexes: ['group_id'],
};

type Collections = {
  calendar_entries: RxCollection<CalendarEntry>;
  calendar_entry_settings: RxCollection<CalendarEntrySettings>;
  groups: RxCollection<Group>;
  group_members: RxCollection<GroupMember>;
};

let database: Promise<RxDatabase<Collections>> | undefined;

/** The app's local database. Created on first use. */
export function getDatabase() {
  database ??= createRxDatabase<Collections>({
    name: 'grouploop',
    localDocuments: true,
    ...platformOptions,
  }).then(async (db) => {
    await db.addCollections({
      calendar_entries: {
        schema: calendarEntrySchema,
        // Entries from before sharing with groups existed.
        migrationStrategies: { 1: (doc) => ({ ...doc, group_ids: [] }), 2: toInitialBackend },
      },
      calendar_entry_settings: { schema: calendarEntrySettingsSchema },
      groups: { schema: groupSchema, migrationStrategies: { 1: toInitialBackend } },
      group_members: {
        schema: groupMemberSchema,
        // Rows synced before invitations existed. Invitations synced by an outdated app lack
        // the status, but also have no user yet.
        migrationStrategies: {
          1: (doc) => ({ ...doc, status: doc.user_id ? 'active' : 'pending' }),
          2: toInitialBackend,
        },
      },
    });
    return db;
  });
  return database;
}
