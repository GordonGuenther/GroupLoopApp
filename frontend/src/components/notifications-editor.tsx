import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { EntryNotification, NotificationMethod } from '@/db/calendar-entries';
import { useTheme } from '@/hooks/use-theme';

const UNITS = [
  { name: 'minute', minutes: 1 },
  { name: 'hour', minutes: 60 },
  { name: 'day', minutes: 24 * 60 },
  { name: 'week', minutes: 7 * 24 * 60 },
];

const METHODS: { method: NotificationMethod; label: string }[] = [
  { method: 'message', label: 'Message' },
  { method: 'alarm', label: 'Alarm' },
];

/** E.g. `2 hours before`, in the largest unit that fits evenly. */
function describe(minutes: number) {
  if (minutes === 0) return 'At start';
  const unit = UNITS.findLast((other) => minutes % other.minutes === 0) ?? UNITS[0];
  const count = minutes / unit.minutes;
  return `${count} ${unit.name}${count === 1 ? '' : 's'} before`;
}

type ChipProps = { label: string; selected: boolean; onPress: () => void };

function Chip({ label, selected, onPress }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: theme.backgroundSelected },
        selected && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type NotificationsEditorProps = {
  value: EntryNotification[];
  onChange: (notifications: EntryNotification[]) => void | Promise<void>;
  onEnableMessage: () => Promise<void>;
};

/** The user's own notifications for an entry: a list to remove from, and a row to add one. */
export function NotificationsEditor({ value, onChange, onEnableMessage }: NotificationsEditorProps) {
  const theme = useTheme();
  const [amount, setAmount] = useState('15');
  const [unitMinutes, setUnitMinutes] = useState(1);
  const [method, setMethod] = useState<NotificationMethod>('message');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const numericAmount = /^\d+$/.test(amount);
  const minutes = Number(amount) * unitMinutes;
  const valid =
    numericAmount && Number.isSafeInteger(minutes) && minutes <= 2_147_483_647;
  const exists = value.some((other) => other.minutes === minutes && other.method === method);

  const add = async () => {
    if (!valid || exists || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (method === 'message' && Platform.OS === 'android') await onEnableMessage();
      await onChange([...value, { minutes, method }].sort((a, b) => b.minutes - a.minutes));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {value.map((notification) => (
        <View key={`${notification.minutes}:${notification.method}`} style={styles.row}>
          <ThemedText style={styles.label}>
            {describe(notification.minutes)} ·{' '}
            {METHODS.find((other) => other.method === notification.method)?.label}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove notification"
            hitSlop={Spacing.two}
            onPress={() => onChange(value.filter((other) => other !== notification))}>
            <ThemedText themeColor="textSecondary">✕</ThemedText>
          </Pressable>
        </View>
      ))}

      <View style={styles.row}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          accessibilityLabel="Amount"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
        {UNITS.map((unit) => (
          <Chip
            key={unit.name}
            label={`${unit.name}s`}
            selected={unitMinutes === unit.minutes}
            onPress={() => setUnitMinutes(unit.minutes)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {METHODS.map((other) => (
          <Chip
            key={other.method}
            label={other.label}
            selected={method === other.method}
            onPress={() => setMethod(other.method)}
          />
        ))}
        <Pressable disabled={!valid || exists || busy} onPress={() => void add()}>
          <ThemedView
            type="backgroundSelected"
            style={[styles.button, (!valid || exists || busy) && styles.disabled]}>
            <ThemedText type="smallBold">{busy ? 'Checking…' : 'Add'}</ThemedText>
          </ThemedView>
        </Pressable>
      </View>
      {numericAmount && !valid && (
        <ThemedText type="small" themeColor="textSecondary">
          The reminder offset is too large.
        </ThemedText>
      )}
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  input: {
    width: 64,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
    borderWidth: 1,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  disabled: {
    opacity: 0.4,
  },
});
