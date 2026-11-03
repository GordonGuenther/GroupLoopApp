import { Link, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AddEntryButtonProps = {
  href: Href;
  label: string;
};

/** Primary action in the page header (web). */
export function AddEntryButton({ href, label }: AddEntryButtonProps) {
  const theme = useTheme();
  return (
    <Link href={href} asChild>
      <Pressable style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundSelected" style={styles.headerButton}>
          <SymbolView
            tintColor={theme.text}
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={14}
          />
          <ThemedText type="smallBold">{label}</ThemedText>
        </ThemedView>
      </Pressable>
    </Link>
  );
}

/** Floating action button above the tab bar (native). */
export function AddEntryFab({ href, label, bottom }: AddEntryButtonProps & { bottom: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.fab, { bottom, backgroundColor: theme.text }]}>
      <Link href={href} asChild>
        <Pressable accessibilityLabel={label} style={styles.fabPressable}>
          <SymbolView
            tintColor={theme.background}
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={24}
          />
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  fab: {
    position: 'absolute',
    right: Spacing.four,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    elevation: 4,
  },
  fabPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
