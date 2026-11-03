import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { DateTimeField } from '@/components/date-time-field';
import { GroupChip } from '@/components/group-chip';
import { NotificationsEditor } from '@/components/notifications-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { CalendarEntryValues, EntryNotification } from '@/db/calendar-entries';
import { useGroups } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

const HOUR = 60 * 60 * 1000;

/** The next full hour. */
const nextHour = () => new Date(Math.ceil(Date.now() / HOUR) * HOUR);

type CalendarEntryFormProps = {
  initial?: CalendarEntryValues;
  /** The backend an existing entry is saved on. */
  backendId?: string;
  /** Only the creator may remove groups they are not a full member of. */
  isCreator: boolean;
  /** The user's own notifications, on adding only. Existing entries have them on their screen. */
  onSave: (entry: CalendarEntryValues, notifications: EntryNotification[]) => Promise<void>;
};

/** Title, time and groups of a calendar entry, for adding and editing. */
export function CalendarEntryForm({
  initial,
  backendId,
  isCreator,
  onSave,
}: CalendarEntryFormProps) {
  const theme = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState(() => initial?.start ?? nextHour());
  const [end, setEnd] = useState(() => initial?.end ?? new Date(nextHour().getTime() + HOUR));
  const [groupIds, setGroupIds] = useState(initial?.groupIds ?? []);
  const [notifications, setNotifications] = useState<EntryNotification[]>([]);

  const groups = useGroups() ?? [];
  // An entry is saved on one backend, so it is only shared with groups there. Only its creator
  // may move it to another backend.
  const lockedBackendId =
    groupIds.length > 0
      ? (groups.find((group) => groupIds.includes(group.id))?.backend_id ?? backendId)
      : isCreator
        ? undefined
        : backendId;
  const available = groups.filter(
    (group) => !lockedBackendId || group.backend_id === lockedBackendId
  );
  // Only full members may add or remove a group.
  const writable = available.filter(
    (group) => group.role === 'full' || (isCreator && initial?.groupIds.includes(group.id))
  );
  const fixed = groups.filter(
    (group) => groupIds.includes(group.id) && !writable.some((other) => other.id === group.id)
  );
  // Groups the user is not a member of stay attached, too.
  const unknownCount = groupIds.filter((id) => !groups.some((group) => group.id === id)).length;

  const toggleGroup = (id: string) =>
    setGroupIds(
      groupIds.includes(id) ? groupIds.filter((other) => other !== id) : [...groupIds, id]
    );

  const endBeforeStart = end < start;
  // Editors see the entry through their full groups; without one they would lose it.
  const losesAccess =
    !isCreator &&
    !groupIds.some((id) => groups.some((group) => group.id === id && group.role === 'full'));
  const canSave = title.trim() !== '' && !endBeforeStart && !losesAccess;

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <ThemedView style={styles.container}>
        <ThemedText type="smallBold">Title</ThemedText>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What's happening?"
          placeholderTextColor={theme.textSecondary}
          autoFocus={!initial}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <ThemedText type="smallBold">Start</ThemedText>
        <DateTimeField value={start} onChange={setStart} />

        <ThemedText type="smallBold">End</ThemedText>
        <DateTimeField value={end} onChange={setEnd} />
        {endBeforeStart && (
          <ThemedText type="small" themeColor="textSecondary">
            The end must not be before the start.
          </ThemedText>
        )}

        {writable.length + fixed.length + unknownCount > 0 && (
          <>
            <ThemedText type="smallBold">Share with groups</ThemedText>
            <View style={styles.groups}>
              {writable.map((group) => (
                <GroupChip
                  key={group.id}
                  group={group}
                  selected={groupIds.includes(group.id)}
                  onPress={() => toggleGroup(group.id)}
                />
              ))}
              {fixed.map((group) => (
                <GroupChip key={group.id} group={group} />
              ))}
              {unknownCount > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  + {unknownCount} other group{unknownCount > 1 && 's'}
                </ThemedText>
              )}
            </View>
            {available.length < groups.length && (
              <ThemedText type="small" themeColor="textSecondary">
                Groups on other backends are hidden: an entry can only be shared on one backend.
              </ThemedText>
            )}
            {losesAccess && (
              <ThemedText type="small" themeColor="textSecondary">
                Keep at least one of your read-write groups, or you lose access to this entry.
              </ThemedText>
            )}
          </>
        )}

        {!initial && (
          <>
            <ThemedText type="smallBold">My notifications</ThemedText>
            <NotificationsEditor value={notifications} onChange={setNotifications} />
          </>
        )}

        <Pressable
          disabled={!canSave}
          onPress={() => onSave({ title: title.trim(), start, end, groupIds }, notifications)}
          style={styles.save}>
          <ThemedView type="backgroundSelected" style={[styles.button, !canSave && styles.disabled]}>
            <ThemedText type="smallBold">Save</ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  groups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  save: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  disabled: {
    opacity: 0.4,
  },
});
