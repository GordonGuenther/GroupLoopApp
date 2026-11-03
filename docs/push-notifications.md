# Android Message reminders

GroupLoop delivers **Message** reminders as Android push notifications, so reminder timing does not
depend on GroupLoop running in the background. **Alarm** reminders are not sent as push notifications.
iOS and web notification behavior is unchanged.

## Requirements before enabling Message

Push delivery requires all of the following; this repository does not contain an EAS project ID or
Firebase credentials:

1. An EAS project ID in the Expo app configuration at `extra.eas.projectId`.
2. A Firebase Android app for `de.clover1.grouploop` and its `google-services.json` path configured
   with `android.googleServicesFile`.
3. Android FCM v1 credentials configured for that EAS project.
4. Migration `010_calendar_message_push.sql` applied to each Supabase backend used by the app.
5. The FCM readiness marker set in Vault on each backend (see below).
6. A custom Android development or release build made after installing `expo-notifications` and
   configuring the plugin. Expo Go does not support remote push notifications on Android.

Set up the EAS project and FCM v1 credentials using the
[Expo push setup guide](https://docs.expo.dev/push-notifications/push-notifications-setup/) and
[FCM v1 credential guide](https://docs.expo.dev/push-notifications/fcm-credentials/). These external
steps have not been performed for this repository:

1. Sign in to EAS and create/link this app's EAS project (for example, `npx eas-cli@latest init`).
   Use the generated project UUID; do not invent or reuse an ID from another app.
2. In Firebase, create/configure an Android app with the existing application ID
   `de.clover1.grouploop`. Download its `google-services.json` and configure its path using
   `android.googleServicesFile` in `frontend/app.json`. This file has public-facing app identifiers;
   apply your project's source-control policy before adding it.
3. Upload the Firebase service-account private key to the EAS project's Android FCM v1 credentials
   using `npx eas-cli@latest credentials` or the Expo dashboard. Keep that private-key JSON, Expo
   access tokens, and Supabase service-role keys out of source control and the JavaScript bundle.

Once FCM is configured in EAS, an administrator must mark **each** Supabase backend ready:

```sql
select public.set_backend_secret('grouploop_android_fcm_v1_configured', 'true');
```

This marker is an operator attestation that the Android FCM v1 credential has been configured; it
does not contain that credential. The registration RPC rejects tokens until the marker is present.
If an Expo Push Service access token is enabled for the EAS project, store it server-side only:

```sql
select public.set_backend_secret('grouploop_expo_push_access_token', '<server-only Expo access token>');
```

The access token is optional. Never add either value to the app config, `.env` files tracked by Git,
or the JavaScript bundle.

## Build and rollout

From `frontend/`, install the SDK-compatible package and create a fresh native build after adding
the real EAS project ID and Firebase `google-services.json` configuration:

```sh
npx expo install expo-notifications
npx expo run:android
```

For EAS builds, build a new Android development or release binary after the EAS project and FCM
credentials are configured. The notification config plugin and Android channel are native build
configuration; an OTA JavaScript update alone cannot add them to an already installed binary.

From the repository root, apply database changes to every backend with:

```sh
sh backend/migrate.sh
```

The migration creates owner-private token storage, an idempotent delivery outbox, and a one-minute
`pg_cron` job that calls Expo Push Service through `pg_net`. It does not expose device tokens or
delivery records to authenticated users or RxDB replication. Existing reminder settings remain
per-user and per-backend.

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

- **No EAS project ID:** set the real `extra.eas.projectId` created for this app in the Expo app
  config, then rebuild. Do not copy an ID from another project.
- **Android push is not configured on this backend:** set up FCM v1 credentials in EAS, apply the
  migration, then set the backend readiness marker above.
- **Migration RPC is missing:** apply `sh backend/migrate.sh` on that backend and restart the app.
- **Permission is denied:** enable GroupLoop notifications in Android system settings, then add the
  Message reminder again.
- **Push was queued but not received:** inspect `calendar_message_push_deliveries` on the backend
  for `status`, `attempts`, `receipt_attempts`, and `last_error`. A status of `sent` means Expo
  confirmed handoff to Android's push service, not that Android displayed the notification. Check
  Android notification settings and the FCM credential in EAS.
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
