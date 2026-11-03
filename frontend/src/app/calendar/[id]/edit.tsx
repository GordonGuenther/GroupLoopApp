import { router, useLocalSearchParams } from 'expo-router';

import { CalendarEntryForm } from '@/components/calendar-entry-form';
import { updateCalendarEntry, useCalendarEntry } from '@/db/calendar-entries';
import { useUser } from '@/db/groups';

export default function EditCalendarEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useCalendarEntry(id);
  const user = useUser(entry?.backend_id);

  // The form keeps its own state, so it starts once the entry has loaded.
  if (!entry || user === undefined) return null;

  return (
    <CalendarEntryForm
      initial={{
        title: entry.title,
        start: new Date(entry.starts_at),
        end: new Date(entry.ends_at),
        groupIds: entry.group_ids,
      }}
      backendId={entry.backend_id}
      isCreator={!entry.user_id || entry.user_id === user?.id}
      onSave={async (values) => {
        // Moved to another backend, the entry has a new id and its old screen is gone.
        if ((await updateCalendarEntry(id, values)) === id) router.back();
        else router.dismissTo('/calendar');
      }}
    />
  );
}
