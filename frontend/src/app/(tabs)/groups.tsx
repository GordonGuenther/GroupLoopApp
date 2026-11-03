import { Link } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddEntryButton, AddEntryFab } from '@/components/add-entry-button';
import { GroupImage } from '@/components/group-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useGroups } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

const TILE_SIZE = 140;

export default function GroupsScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();
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
            <ThemedText type="subtitle">Groups</ThemedText>
            {Platform.OS === 'web' && <AddEntryButton href="/groups/add" label="New group" />}
          </ThemedView>

          {groups?.length === 0 && (
            <ThemedText style={styles.centerText} themeColor="textSecondary">
              No groups yet.
            </ThemedText>
          )}
          <ThemedView style={styles.grid}>
            {groups?.map((group) => (
              <Link key={group.id} href={`/groups/${group.id}`} asChild>
                <Pressable style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
                  <GroupImage image={group.image} color={group.color} size={TILE_SIZE} />
                  <ThemedText type="smallBold" numberOfLines={2} style={styles.centerText}>
                    {group.name}
                  </ThemedText>
                </Pressable>
              </Link>
            ))}
          </ThemedView>
        </ThemedView>
      </ScrollView>
      {Platform.OS !== 'web' && (
        <AddEntryFab
          href="/groups/add"
          label="New group"
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  tile: {
    width: TILE_SIZE,
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
