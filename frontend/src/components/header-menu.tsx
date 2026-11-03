import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MenuItem = { label: string; onPress: () => void; destructive?: boolean };

/** A ☰ button for the header that opens a small menu. */
export function HeaderMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        hitSlop={Spacing.two}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <SymbolView
          tintColor={theme.text}
          name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
          size={22}
        />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <ThemedView type="backgroundElement" style={styles.menu}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setOpen(false);
                  item.onPress();
                }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
                <ThemedText type="small" style={item.destructive && styles.destructive}>
                  {item.label}
                </ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.two,
  },
  backdrop: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: Spacing.six * 2,
    paddingRight: Spacing.three,
  },
  menu: {
    minWidth: 200,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.one,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  item: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  destructive: {
    color: '#e53935',
  },
  pressed: {
    opacity: 0.7,
  },
});
