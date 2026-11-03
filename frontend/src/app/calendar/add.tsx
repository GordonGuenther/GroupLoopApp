import { router } from 'expo-router';

import { CalendarEntryForm } from '@/components/calendar-entry-form';
import { addCalendarEntry } from '@/db/calendar-entries';

export default function AddCalendarEntryScreen() {
  return (
    <CalendarEntryForm
      isCreator
      onSave={async (entry, notifications) => {
        await addCalendarEntry(entry, notifications);
        router.back();
      }}
    />
  );
}
