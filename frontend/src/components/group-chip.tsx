import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Group } from '@/db/database';
import { useTheme } from '@/hooks/use-theme';

type GroupChipProps = {
  group: Group;
  /** Makes the chip a toggle. */
  onPress?: () => void;
  selected?: boolean;
};

/** A group's name with its color, as a label or a toggle. */
export function GroupChip({ group, onPress, selected = true }: GroupChipProps) {
  const theme = useTheme();
  const chip = (
    <View
      style={[
        styles.chip,
        { borderColor: selected ? group.color : theme.backgroundSelected },
        selected && { backgroundColor: `${group.color}22` },
      ]}>
      <View style={[styles.dot, { backgroundColor: group.color }]} />
      <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
        {group.name}
      </ThemedText>
    </View>
  );
  if (!onPress) return chip;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}>
      {chip}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.five,
    borderWidth: 1.5,
    maxWidth: 200,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
