# calendar-notifications — per-member notification config on calendar entries

Class: L (migration, new synced collection, details screen + add form)

## Goal
Every member who sees an entry keeps their own list of notifications for it: offset before start
(0 = at start) + method `message` (push) or `alarm` (rings until dismissed). Configuration only;
delivery comes later.

## Decisions (answered)
- Per member, not shared: synced rows in new table `calendar_entry_settings` (random id, `entry_id`,
  `user_id` set by backend like entries), `notifications text[]` of `"<minutes>:<method>"`.
  text[] passes the existing array sync path (`toPostgresArrays`); jsonb would break RxDB's
  field-equality check on update (throws for objects).
- Works signed out: rows created offline get their user on first sync. Two own rows for one entry
  (two devices before sync) are shown merged and merged into one on next save.
- Moving an entry to another backend copies own settings along.
- Managed in a "My notifications" section on the entry details screen (all members, read-only too,
  saves immediately) and in the add form. Edit form unchanged.
- Offset input: number + unit chips (minutes/hours/days/weeks) + method chips + Add.
- Later delivery (not this task): device schedules locally (expo-notifications for messages, native
  alarm APIs for alarms); backend sends silent "resync" push when an entry changes.

## Assumptions (not verified / decided by me — object at gate)
- No FK from settings to `calendar_entries`: the two collections push independently, a settings row
  may arrive first. Orphans (deleted entries) stay and are ignored.
- Deleting an entry leaves own settings row untouched.
- Offsets only before or at start; no "after start". Duplicates ignored; list sorted earliest first.
- No new entry gets default notifications.

## Plan (8 files, ~290 lines)
1. `backend/migrations/008_calendar_entry_settings.sql` — table, `set_modified` + `0_reject_existing_row`
   triggers, RLS own rows only, realtime publication.
2. `db/database.ts` — `CalendarEntrySettings` type + schema v0, collection.
3. `db/sync.ts` — add table to `TABLES` (also covers disconnect wipe).
4. `db/calendar-entries.ts` — `Notification` type + parse/format, `useNotifications(entryId, backendId)`,
   `setNotifications(...)`, `addCalendarEntry` returns id, move copies own settings.
5. `components/notifications-editor.tsx` — list with remove + add row.
6. `components/calendar-entry-form.tsx` — optional notifications section (add only).
7. `app/calendar/add.tsx` — save notifications after insert.
8. `app/calendar/[id]/index.tsx` — "My notifications" section.

## Verification
- `npx tsc --noEmit`, `npx expo lint`.
- Manual: run `backend/migrate.sh`, add/remove notifications as full and read member, check second
  device of same user syncs, other member does not see them.

## Status
- [x] gate approved (signed-out support added at gate)
- [x] implemented; `tsc --noEmit` clean, `expo lint` clean except pre-existing error in `hooks/use-color-scheme.web.ts`
- [ ] manual check on device + `backend/migrate.sh` (dev)
- [x] found while testing: update pushes failed for all tables since multi-backend — RxDB 17.5.0
  `addDocEqualityToQuery` adds `is(backend_id, null)` for schema fields missing from the pushed row.
  Fix: `009_backend_id_placeholder.sql` (always-null column). 008 + 009 applied to local dev backend.
