import { Link } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddEntryButton, AddEntryFab } from '@/components/add-entry-button';
import { GroupChip } from '@/components/group-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCalendarEntries } from '@/db/calendar-entries';
import { useGroups } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

const formatRange = (start: string, end: string) =>
  `${new Date(start).toLocaleString()} – ${new Date(end).toLocaleString()}`;

export default function CalendarScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
  const entries = useCalendarEntries();
  const groups = useGroups();

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.four,
    },
  });

  return (
    <>
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentInset={insets}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
        <ThemedView style={styles.container}>
          <ThemedView style={styles.titleContainer}>
            <ThemedText type="subtitle">Calendar</ThemedText>
            {Platform.OS === 'web' && <AddEntryButton href="/calendar/add" label="New entry" />}
          </ThemedView>

          <ThemedView style={styles.list}>
            {entries?.length === 0 && (
              <ThemedText style={styles.centerText} themeColor="textSecondary">
                No entries yet.
              </ThemedText>
            )}
            {entries?.map((entry) => (
              <Link key={entry.id} href={`/calendar/${entry.id}`} asChild>
                <Pressable style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundElement" style={styles.entry}>
                    <ThemedText type="smallBold">{entry.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatRange(entry.starts_at, entry.ends_at)}
                    </ThemedText>
                    {entry.group_ids.length > 0 && (
                      <ThemedView type="backgroundElement" style={styles.groups}>
                        {groups
                          ?.filter((group) => entry.group_ids.includes(group.id))
                          .map((group) => (
                            <GroupChip key={group.id} group={group} />
                          ))}
                      </ThemedView>
                    )}
                  </ThemedView>
                </Pressable>
              </Link>
            ))}
          </ThemedView>
        </ThemedView>
      </ScrollView>
      {Platform.OS !== 'web' && (
        <AddEntryFab
          href="/calendar/add"
          label="New entry"
          bottom={Platform.OS === 'android' ? Spacing.four : insets.bottom}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  groups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  entry: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
