---
title: 'Android Message Push Reminders'
type: feature
created: '2026-11-03'
status: done
baseline_commit: e353f41
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Calendar entries already store per-user `message` reminders, but no message is delivered. A reminder must arrive on Android even when GroupLoop is backgrounded or terminated.

**Approach:** Register the Android installation's Expo push token with each signed-in Supabase backend that has the user's message reminders. A backend scheduler will dispatch due reminders through Expo Push Service, independently of the app process.

## Boundaries & Constraints

**Always:** Keep reminder settings private to their owner; support the app's multiple Supabase backends; do not send `alarm` reminders as push messages; make delivery idempotent and re-check current entry/settings before dispatch; show actionable permission/configuration errors. Keep all service credentials on the server.

**Ask First:** An EAS project ID and Android FCM v1 credentials are not configured in this repository. Implement configuration hooks and setup documentation, but external EAS/Firebase provisioning and real-device delivery testing require the owner's credentials and device.

**Never:** Put FCM, Supabase service-role, or Expo access secrets in the app bundle or source control. Do not silently substitute local notifications for push. Do not change iOS or `alarm` behavior in this feature.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Android message reminder | Signed-in user, granted notification permission, synced entry and message offset | Server sends a visible Expo push at the reminder time; it is delivered with the app backgrounded or terminated | Transient send failures remain observable and retryable |
| Permission denied | User enables a message reminder without Android notification permission | Do not claim the reminder is active; retain existing settings and explain how to enable permission before retrying | Show a clear, actionable message |
| Stale or changed reminder | Entry/settings change or are deleted before the due time | No obsolete push; each current reminder is dispatched at most once | Record delivery status for diagnosis |
| Missing EAS/FCM setup | App cannot obtain a project-scoped Expo token or Expo has no Android credentials | No token registration or successful-shaped fallback | Surface actionable setup guidance; keep the rest of the app usable |

</frozen-after-approval>

## Code Map

- `frontend/app.json` -- Expo Notifications plugin and Android notification configuration.
- `frontend/src/auth.ts` and `frontend/src/db/sync.ts` -- per-backend auth and offline-first sync lifecycle.
- `frontend/src/db/push-notifications.ts` -- Android permission, token registration, and cleanup.
- `frontend/src/db/calendar-entries.ts` -- message reminder values and persistence.
- `frontend/src/components/notifications-editor.tsx` -- user adds/removes message reminders.
- `frontend/src/app/_layout.tsx` -- application-level notification registration and tap handling.
- `backend/migrations/008_calendar_entry_settings.sql` -- owner-private reminder settings.
- `backend/migrations/010_calendar_message_push.sql` -- private tokens, outbox, Expo dispatch, and receipts.
- `backend/migrations/005_group_invitations.sql` -- existing `pg_net` and backend secret patterns.
- `backend/migrate.sh` -- self-hosted backend migration flow.
- `docs/backend-setup.md` -- self-hosted Supabase operations and setup guidance.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/package.json`, `frontend/app.json` -- install SDK-compatible `expo-notifications` and configure its plugin/channel.
- [x] `frontend/src/components/notifications-editor.tsx`, `frontend/src/app/_layout.tsx`, `frontend/src/db/` -- request Android permission when enabling Message, register/update tokens per signed-in backend, and route notification taps to the entry.
- [x] `backend/migrations/010_calendar_message_push.sql` -- add owner-scoped token storage, an idempotent due-reminder outbox/dispatcher using `pg_cron` and `pg_net`, and stale-token/error handling without exposing tokens through replication.
- [x] `docs/push-notifications.md`, `docs/backend-setup.md` -- document EAS project/FCM setup, custom build requirements, migration rollout, permission behavior, and troubleshooting.

**Acceptance Criteria:**
- Given an Android device has permission and a registered Expo token, when a synced message reminder becomes due, then the backend sends one push even if the app is not running.
- Given a reminder is `alarm`, when the scheduler runs, then it sends no push for that reminder.
- Given an entry or message reminder is edited or deleted before it is due, when the scheduler runs, then it does not dispatch the obsolete reminder.
- Given the user taps a delivered push, when GroupLoop opens, then it navigates to the matching calendar entry.
- Given push permission or EAS/FCM setup is unavailable, when the user enables Message, then the app reports the problem clearly and does not report successful push registration.

## Spec Change Log

## Design Notes

The backend is responsible for timing: Android push delivery does not depend on a background task running in the app. Token records are private to the authenticated user and stored independently on each backend, matching the existing multi-backend model.

## Verification

**Commands:**
- Targeted ESLint on all changed frontend files -- passed.
- `cd frontend && npx tsc --noEmit` -- still reports existing errors in `app-tabs.tsx`,
  `app-tabs.web.tsx`, and `use-theme.ts`; no changed files are reported.
- `cd frontend && npx expo config --type public --json` -- passed.
- Applied the migration inside a transaction and rolled it back on the local Supabase database --
  passed.
- `git diff --check` -- passed.

**Manual checks:**
- Physical-device permission and delivery checks remain blocked until the owner configures the EAS
  project and Android FCM v1 credentials. Then verify permission grant/denial, background and
  terminated delivery, duplicate suppression, stale reminder cancellation, and tap navigation.
- The rollback migration check verified schema/function creation without persisting the scheduler;
  inspect scheduler status and delivery/receipt records after rollout on each backend.

## Suggested Review Order

**Enabling and registering reminders**

- Gate Android Message activation on permission, EAS setup, and authenticated token registration.
  [`notifications-editor.tsx:70`](../../frontend/src/components/notifications-editor.tsx#L70)

- Bind each Expo token to its authenticated backend without syncing it to RxDB.
  [`push-notifications.ts:31`](../../frontend/src/db/push-notifications.ts#L31)

- Route newly added reminders to the entry's selected backend.
  [`calendar-entry-form.tsx:58`](../../frontend/src/components/calendar-entry-form.tsx#L58)

**Scheduled delivery and privacy**

- Keep token storage owner-scoped and inaccessible to client table queries.
  [`010_calendar_message_push.sql:4`](../../backend/migrations/010_calendar_message_push.sql#L4)

- Reconcile current message settings and dispatch due work idempotently with retry records.
  [`010_calendar_message_push.sql:95`](../../backend/migrations/010_calendar_message_push.sql#L95)

- Resolve Expo tickets and receipts; retry transient failures and remove unregistered tokens.
  [`010_calendar_message_push.sql:261`](../../backend/migrations/010_calendar_message_push.sql#L261)

**Tap navigation and operations**

- Handle notification taps from both app launches and active sessions.
  [`_layout.tsx:13`](../../frontend/src/app/_layout.tsx#L13)

- Configure EAS/FCM prerequisites and troubleshoot backend delivery.
  [`push-notifications.md:7`](../push-notifications.md#L7)

- Roll the migration and Vault readiness marker across self-hosted backends.
  [`backend-setup.md:88`](../backend-setup.md#L88)

**Build configuration**

- Configure the Android notification channel without enabling iOS remote notifications.
  [`app.json:24`](../../frontend/app.json#L24)

- Match the installed notifications module to Expo SDK 58.
  [`package.json:17`](../../frontend/package.json#L17)
