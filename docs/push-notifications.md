# Android Message reminders

GroupLoop delivers **Message** reminders as Android push notifications, so reminder timing does not
depend on GroupLoop running in the background. **Alarm** reminders are not sent as push notifications.
iOS and web notification behavior is unchanged.

## Deployment model: one app, independently hosted backends

The GroupLoop app is centrally maintained and released. Self-hosting operators run their own
backend; they do **not** create an EAS project, configure Firebase, build, or distribute a separate
app. All supported installations use the centrally released Android app, one EAS project, and the
matching Firebase Android app/FCM credentials.

A user can connect the same app to multiple independent backends. The app registers that
installation's Expo push token separately with each signed-in backend where the user's settings
include a Message reminder. Each backend stores its own registrations and reminder deliveries, and
independently sends due pushes through Expo Push Service to the same centrally configured app. The
backend's calendar data and reminder settings stay on that backend.

| Done once by the central app publisher | Done by each backend operator |
|---|---|
| Create/link the app's EAS project and set its project ID in the app config. | Apply migration `010_calendar_message_push.sql` to the backend. |
| Configure the Firebase Android app for `de.clover1.grouploop` and its FCM v1 credential in that EAS project. | Set the backend's FCM readiness marker in Vault after central push setup is complete. |
| Configure and release the Android app with `expo-notifications`. | If Expo Push Service access-token authentication is enabled centrally, securely configure that project's access token in this backend's Vault. |
| Keep the EAS/Firebase project and credentials available for future app releases and push delivery. | Keep the backend's Supabase `pg_cron`/`pg_net` services operational and monitor its delivery records. |

Operators do not need the Firebase service-account key. An Expo Push Service access token, when
used, is a separate optional server-side secret; it is not the FCM credential.

## Central setup (app publisher, once)

The EAS project ID and Firebase credentials have not been provisioned for this repository. The app
publisher must complete these steps before releasing an Android build with push support:

1. Sign in to EAS and create/link the GroupLoop app's EAS project (for example,
   `npx eas-cli@latest init`). Use the generated project UUID; do not invent or reuse an ID from
   another app. Configure it as `extra.eas.projectId`.
2. In Firebase, create/configure an Android app with the existing application ID
   `de.clover1.grouploop`. Download its `google-services.json` and configure its path using
   `android.googleServicesFile` in `frontend/app.json`. This file has public-facing app identifiers;
   apply the project's source-control policy before adding it.
3. Upload the Firebase service-account private key to the EAS project's Android FCM v1 credentials
   using `npx eas-cli@latest credentials` or the Expo dashboard.
4. Build and distribute a new Android app version with the notification plugin/channel configured.
   Expo Go does not support remote push notifications on Android.

Use the [Expo push setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/)
and [FCM v1 credential guide](https://docs.expo.dev/push-notifications/fcm-credentials/). The
notification plugin and Android channel are native build configuration: after changing them, a new
centrally distributed native build is required; an OTA JavaScript update is not enough. Backend
operators do not make this app build.

Keep the Firebase service-account private key, Expo access tokens, and Supabase service-role keys
out of source control and the JavaScript bundle.

## Setup on each self-hosted backend

Complete these steps separately for every Supabase backend that should send reminders:

1. From the repository root, apply migrations to that backend:

   ```sh
   sh backend/migrate.sh
   ```

   Migration `010_calendar_message_push.sql` creates private token storage, an idempotent delivery
   outbox, and a one-minute `pg_cron` job that calls Expo Push Service through `pg_net`. It does not
   expose device tokens or delivery records to authenticated users or RxDB replication. The backend
   must have the Supabase `pg_cron` and `pg_net` services available.
2. After the central app publisher has configured EAS/Firebase FCM v1 and released the push-enabled
   app, mark this backend ready in its Vault:

   ```sql
   select public.set_backend_secret('grouploop_android_fcm_v1_configured', 'true');
   ```

   This marker is only an operator attestation for this backend; it does not contain or validate
   the Firebase credential. The authenticated token-registration RPC rejects registrations until
   the marker is present.
3. If Expo Push Service access-token authentication is enabled for the central EAS project, obtain
   that project's access token from the app publisher over a secure channel and store it only in
   this backend's Vault:

   ```sql
   select public.set_backend_secret('grouploop_expo_push_access_token', '<server-only Expo access token>');
   ```

   This access token is optional and is not the Firebase service-account key. Never put it in app
   config, tracked `.env` files, or the JavaScript bundle.
4. Confirm the migration and scheduled job are active on this backend. Users signed in to it can
   then add Message reminders; the app registers tokens with that backend automatically when
   needed. Repeat for every independent backend.

Reminder settings remain per-user and per-backend. Each backend queues and sends only the reminders
stored there; connecting another backend does not move or expose this backend's calendar data.

## Permission and behavior

When a user adds an Android **Message** reminder, GroupLoop creates the notification channel before
requesting OS permission, obtains an EAS-project-scoped Expo token, and registers it through the
signed-in user's Supabase session. A denied permission or missing project/backend setup prevents
the new Message reminder from being added and displays instructions. The user can allow
notifications in **Android Settings → Apps → GroupLoop → Notifications**, then retry. Alarm
reminders and iOS behavior do not use this registration flow.

The backend sends only due `message` offsets. It checks the current entry and owner's current
settings before each dispatch, suppresses duplicate deliveries per reminder and device, records
Expo responses and errors, retries transient failures with backoff, and checks delivery receipts.
An Expo receipt confirms handoff to Android's push service, not that the notification was displayed.
Tokens reported as unregistered by Expo are removed from the backend.

Tapping a notification opens its calendar entry. If the entry was removed locally or the user no
longer has access, the app shows its normal missing-entry state.

## Troubleshooting

- **No EAS project ID or FCM setup:** this is central app-publisher configuration, not a
  per-backend task. Configure the GroupLoop EAS/Firebase project and publish a new app build.
- **Message reminders are disabled on one backend:** that backend's operator must apply the
  migration and set its Vault readiness marker. The operator does not configure a separate EAS or
  Firebase project.
- **Several backends are connected:** each backend needs its own migration and readiness marker.
  The app registers with each signed-in backend that has Message reminders; check each backend's
  delivery table independently.
- **Migration RPC is missing:** apply `sh backend/migrate.sh` on that backend and restart the app.
- **Permission is denied:** enable GroupLoop notifications in Android system settings, then add the
  Message reminder again.
- **Push was queued but not received:** inspect `calendar_message_push_deliveries` on the backend
  for `status`, `attempts`, `receipt_attempts`, and `last_error`. A status of `sent` means Expo
  confirmed handoff to Android's push service, not that Android displayed the notification. Check
  Android notification settings, that backend's Vault access token if Expo token authentication is
  enabled, and the central EAS project's FCM credential.
- **Retry a corrected, permanently failed delivery:** after correcting the credential or backend
  issue, an administrator can reset only the affected rows:

  ```sql
  update public.calendar_message_push_deliveries
  set status = 'retry', attempts = 0, next_attempt_at = now(),
      request_id = null, receipt_request_id = null, receipt_id = null,
      receipt_attempts = 0, sent_token = null, last_error = null, updated_at = now()
  where status = 'failed' and last_error is not null;
  ```

See the versioned [Expo SDK 58 Notifications API](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)
for library and Android permission details.
