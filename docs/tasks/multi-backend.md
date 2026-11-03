# multi-backend — connect to several backends at once

Class: L (settings, auth, sync, DB layer, group + entry forms)

## Goal
Join groups hosted on different servers. Settings lists backends (name, URL, API key,
connect/disconnect), one marked default. Private entries → default backend. New group →
pick one connected backend; all its data lives there.

## Decisions (answered)
- One shared email field; Connect on a backend row sends that backend a code, code input inline in the row.
- Entry shares with groups of ONE backend only; picking a group disables other backends' groups.
- One local RxDB, rows tagged with local-only `backend_id` (per-DB rejected: RxDB free tier caps open
  collections at 13 → max 4 backends today, ~2 once lists/chat exist). Disconnect retags that backend's
  rows `removed`, then removes them; push only sends rows of its own backend → wipe never reaches a server.
- Changing default affects new private entries only.

## Assumptions (not verified / decided by me — object at gate)
- Existing single backend migrates to backend #1 "Default", marked default, id `initial`, existing rows migrate to
  `backend_id: 'initial'`, keeps its current Supabase storage key → existing session + data survive, no re-login.
- Fresh install seeds the same entry from `EXPO_PUBLIC_*` env defaults.
- New backends: storage key `sb-<uuid>-auth-token` (default key collides for two `localhost` ports).
- Backend list + sessions stay local docs in `grouploop` DB (never synced).
- URL / key / name editable only while that backend is disconnected (as today).
- Group's backend fixed at creation; not movable.
- Editing an entry to share with a group on another backend moves it (creator only): insert with NEW id on new backend, remove old (same id could overwrite the unpushed tombstone).
- Backends removable when disconnected and not default.

## Plan
1. `db/database.ts` — `backend_id` on 3 schemas, version +1, migration → `initial`.
2. `db/settings.ts` — `Backend = {id,name,backendUrl,apiKey}`, `useBackends()`, `getBackends()`, `saveBackends()`; seeded from legacy `settings` doc or env.
3. `auth.ts` — client keyed by backend id, per-backend `storageKey`; `useSessions(backends)` → map id→session.
4. `db/sync.ts` — replications per connected backend; pull adds `backend_id`, push strips it and skips other backends' rows; `disconnect(backend)` cancels, retags, removes.
5. `db/groups.ts`, `db/calendar-entries.ts` — user per backend (`useUsers`, `useUser(backendId)`); `addGroup(values, backendId)`;
   `addCalendarEntry` → group's backend or default; update moves entry on backend change.
6. `settings.tsx` — email + backend rows (name, URL, key, connect/verify/disconnect, "Default" marker/"Make default"), "Add backend".
7. `group-form.tsx` / `groups/add.tsx` — backend picker (connected backends, default preselected) on add only.
8. `calendar-entry-form.tsx` — hide groups of other backends once one is selected (non-creators: locked to entry's backend).
9. `invitation-prompt.tsx`, `calendar/[id]/*`, `groups/[id]/index.tsx` — `useUser(backendId)`.

## Diff budget
~13 files, ~700–800 lines changed. Each file listed above is required: without it either the
list UI, per-backend sync, or backend-correct writes/permissions are missing.

## Verification
`npx tsc --noEmit`, `npx expo lint` once. Manual (dev): two local backends, group on each, private entry → default.

## Log
- 2026-09-30: task file created, 4 design questions answered.
- 2026-09-30: gate passed; move-on-edit (creator only) + remove button in scope.
- 2026-09-30: COL23 limit found (13 collections) → switched to single DB + backend_id, dev agreed.
- 2026-09-30: implemented. `tsc --noEmit` clean. `expo lint`: 1 error in untouched `hooks/use-color-scheme.web.ts` (set-state-in-effect), none in changed files. Manual two-backend test pending (dev).
- Cut: "Reset to default" button (no env-reset per backend). Moving entry → edit modal dismisses to calendar tab (new id). Removing a signed-out, never-disconnected backend leaves its rows hidden on device.
- 2026-09-30: web COL/plugin-missing 'leader-election' on verify → cleanup plugin calls waitForLeadership 60s after start; plugin was only added lazily by replicateSupabase. Registered it in database.ts.
- 2026-09-30: IDB DataError on verify → explicit `storageKey: undefined` overrode Supabase default key → local doc id undefined. Fixed in auth.ts, verified via Playwright sign-in (Connected as test@example.com, no DataError).
- 2026-09-30: invite repro on web (clean profile) → no error, pending row on server. Reported TypeError 'undefined is not a function' is Hermes wording → likely native only; stack requested. Fixed on the way: settings screen unmounted rows while sessions reloaded after saving URL → sent-code field lost.
