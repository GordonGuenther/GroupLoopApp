import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type DateTimeFieldProps = { value: Date; onChange: (value: Date) => void };

/** Picks a date and time. Android has no combined picker, so date and time open separate dialogs. */
export function DateTimeField({ value, onChange }: DateTimeFieldProps) {
  const [open, setOpen] = useState<'date' | 'time'>();

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="datetime"
        display="compact"
        onValueChange={(_event, date) => onChange(date)}
      />
    );
  }

  const select = (date: Date) => {
    setOpen(undefined);
    if (open === 'time') {
      onChange(date);
      return;
    }
    // The date dialog returns midnight UTC of the picked day; keep the time of day.
    const next = new Date(value);
    next.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    onChange(next);
  };

  return (
    <ThemedView style={styles.row}>
      <Pressable onPress={() => setOpen('date')}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText>{value.toLocaleDateString()}</ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable onPress={() => setOpen('time')}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText>
            {value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </ThemedText>
        </ThemedView>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value}
          mode={open}
          onValueChange={(_event, date) => select(date)}
          onDismiss={() => setOpen(undefined)}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
});
