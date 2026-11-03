import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { confirm } from '@/components/dialogs';
import { GroupChip } from '@/components/group-chip';
import { HeaderMenu } from '@/components/header-menu';
import { NotificationsEditor } from '@/components/notifications-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  canEditEntry,
  deleteCalendarEntry,
  setNotifications,
  useCalendarEntry,
  useNotifications,
} from '@/db/calendar-entries';
import { useGroups, useUser } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

const formatTime = (value: string) => new Date(value).toLocaleString();

export default function CalendarEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const entry = useCalendarEntry(id);
  const user = useUser(entry?.backend_id);
  const groups = useGroups();
  const notifications = useNotifications(id);

  const fullGroupIds = new Set(
    groups?.filter((group) => group.role === 'full').map((group) => group.id)
  );
  const canEdit = !!entry && user !== undefined && canEditEntry(entry, user?.id, fullGroupIds);
  const attached = groups?.filter((group) => entry?.group_ids.includes(group.id)) ?? [];

  const confirmDelete = () =>
    confirm(
      'Delete entry?',
      attached.length > 0
        ? `${entry?.title} will be deleted for all members of ${attached
            .map((group) => group.name)
            .join(', ')}. This cannot be undone.`
        : `${entry?.title} will be deleted. This cannot be undone.`,
      'Delete',
      async () => {
        await deleteCalendarEntry(id);
        router.back();
      }
    );

  if (entry === null) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">This entry does not exist.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: entry?.title ?? '',
          headerRight: canEdit
            ? () => (
                <HeaderMenu
                  label="Entry menu"
                  items={[
                    { label: 'Edit entry', onPress: () => router.push(`/calendar/${id}/edit`) },
                    { label: 'Delete entry', onPress: confirmDelete, destructive: true },
                  ]}
                />
              )
            : undefined,
        }}
      />
      {entry && (
        <ThemedView style={styles.container}>
          <ThemedText type="subtitle">{entry.title}</ThemedText>

          <View style={styles.field}>
            <ThemedText type="smallBold">Start</ThemedText>
            <ThemedText>{formatTime(entry.starts_at)}</ThemedText>
          </View>
          <View style={styles.field}>
            <ThemedText type="smallBold">End</ThemedText>
            <ThemedText>{formatTime(entry.ends_at)}</ThemedText>
          </View>

          {attached.length > 0 && (
            <View style={styles.field}>
              <ThemedText type="smallBold">Groups</ThemedText>
              <View style={styles.groups}>
                {attached.map((group) => (
                  <GroupChip key={group.id} group={group} />
                ))}
              </View>
            </View>
          )}

          {notifications && (
            <View style={styles.field}>
              <ThemedText type="smallBold">My notifications</ThemedText>
              <NotificationsEditor
                value={notifications}
                onChange={(next) => setNotifications(id, entry.backend_id, next)}
              />
            </View>
          )}
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  groups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
