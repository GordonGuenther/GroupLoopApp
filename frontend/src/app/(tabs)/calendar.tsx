import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type ScrollViewInstance,
  View,
} from 'react-native';
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
  const [now, setNow] = useState<number>();
  const topScrollOffset =
    Platform.OS === 'web' ? Spacing.six + Spacing.two : safeAreaInsets.top + Spacing.two;
  const scrollViewRef = useRef<ScrollViewInstance | null>(null);
  const containerTop = useRef(0);
  const listTop = useRef(0);
  const nextEntryTop = useRef<number | undefined>(undefined);
  const nextEntryBottom = useRef<number | undefined>(undefined);
  const entryBounds = useRef(new Map<string, { top: number; bottom: number }>());
  const contentHeight = useRef(0);
  const hasScrolled = useRef(false);
  const hasCapturedTime = useRef(false);
  const nextEntryId =
    now === undefined
      ? undefined
      : entries?.find((entry) => new Date(entry.ends_at).getTime() >= now)?.id;

  const scrollToNextEntry = useCallback(() => {
    const scrollView = scrollViewRef.current;
    if (
      !scrollView ||
      nextEntryId === undefined ||
      nextEntryTop.current === undefined ||
      nextEntryBottom.current === undefined ||
      contentHeight.current < containerTop.current + listTop.current + nextEntryBottom.current ||
      hasScrolled.current
    ) {
      return;
    }

    scrollView.scrollTo({
      y: Math.max(
        0,
        containerTop.current + listTop.current + nextEntryTop.current - topScrollOffset
      ),
      animated: false,
    });
    hasScrolled.current = true;
  }, [nextEntryId, topScrollOffset]);

  useEffect(() => {
    if (nextEntryId !== undefined) {
      const bounds = entryBounds.current.get(nextEntryId);
      nextEntryTop.current = bounds?.top;
      nextEntryBottom.current = bounds?.bottom;
    }
    scrollToNextEntry();
  }, [nextEntryId, scrollToNextEntry]);

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: Spacing.six,
      paddingBottom: Spacing.six,
    },
  });

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: theme.background }]}
        contentInset={insets}
        onLayout={() => {
          if (!hasCapturedTime.current) {
            hasCapturedTime.current = true;
            setNow(Date.now());
          }
        }}
        onContentSizeChange={(_, height) => {
          contentHeight.current = height;
          scrollToNextEntry();
        }}
        contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
        <ThemedView
          style={styles.container}
          onLayout={(event) => {
            containerTop.current = event.nativeEvent.layout.y;
            scrollToNextEntry();
          }}>
          <ThemedView style={styles.titleContainer}>
            <ThemedText type="subtitle">Calendar</ThemedText>
          </ThemedView>

          <ThemedView
            style={styles.list}
            onLayout={(event) => {
              listTop.current = event.nativeEvent.layout.y;
              scrollToNextEntry();
            }}>
            {entries?.length === 0 && (
              <ThemedText style={styles.centerText} themeColor="textSecondary">
                No entries yet.
              </ThemedText>
            )}
            {entries?.map((entry) => (
              <Link key={entry.id} href={`/calendar/${entry.id}`} asChild>
                <Pressable
                  onLayout={(event) => {
                    const { y: top, height } = event.nativeEvent.layout;
                    const bounds = { top, bottom: top + height };
                    entryBounds.current.set(entry.id, bounds);
                    if (entry.id === nextEntryId) {
                      nextEntryTop.current = top;
                      nextEntryBottom.current = bounds.bottom;
                      scrollToNextEntry();
                    }
                  }}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView
                    type="backgroundElement"
                    style={[
                      styles.entry,
                      now !== undefined &&
                        new Date(entry.ends_at).getTime() < now &&
                        styles.pastEntry,
                    ]}>
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
      {Platform.OS === 'web' && (
        <View pointerEvents="box-none" style={styles.webAction}>
          <AddEntryButton href="/calendar/add" label="New entry" />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  webAction: {
    position: 'absolute',
    right: Spacing.four,
    bottom: Spacing.four,
    zIndex: 1,
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
  pastEntry: {
    opacity: 0.5,
  },
  entry: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
