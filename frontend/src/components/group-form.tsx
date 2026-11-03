import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { GroupImage } from '@/components/group-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DEFAULT_GROUP_IMAGES } from '@/constants/group-images';
import { Spacing } from '@/constants/theme';
import type { Backend } from '@/db/settings';
import { useTheme } from '@/hooks/use-theme';

const COLORS = [
  '#ff7700',
  '#e53935',
  '#d81b60',
  '#8e24aa',
  '#5e35b1',
  '#1e88e5',
  '#00acc1',
  '#00897b',
  '#43a047',
  '#c0ca33',
  '#fdd835',
  '#6d4c41',
];

type GroupValues = { name: string; color: string; image: string };

type GroupFormProps = {
  initial?: GroupValues;
  /** The connected backends to add the group to, the preselected one first. Not for editing. */
  backends?: Backend[];
  onSave: (group: GroupValues, backendId: string | undefined) => Promise<void>;
};

/** Name, image and color of a group, for adding and editing. */
export function GroupForm({ initial, backends, onSave }: GroupFormProps) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [image, setImage] = useState(initial?.image ?? 'default:1');
  const [choosingImage, setChoosingImage] = useState(false);
  const [backendId, setBackendId] = useState(backends?.[0]?.id);

  const canSave = name.trim() !== '' && (!backends || !!backendId);
  const save = () => onSave({ name: name.trim(), color, image }, backendId);

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <ThemedView style={styles.container}>
        <Pressable
          accessibilityLabel="Choose image"
          onPress={() => setChoosingImage(!choosingImage)}
          style={styles.preview}>
          <GroupImage image={image} color={color} size={140} />
        </Pressable>

        {choosingImage && (
          <View style={styles.imageGrid}>
            {Object.keys(DEFAULT_GROUP_IMAGES).map((key) => (
              <Pressable
                key={key}
                onPress={() => {
                  setImage(key);
                  setChoosingImage(false);
                }}
                style={key !== image && styles.unselected}>
                <GroupImage image={key} color={color} size={64} />
              </Pressable>
            ))}
          </View>
        )}

        <ThemedText type="smallBold">Name</ThemedText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What's the group called?"
          placeholderTextColor={theme.textSecondary}
          autoFocus
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />

        <ThemedText type="smallBold">Color</ThemedText>
        <View style={styles.colors}>
          {COLORS.map((swatch) => (
            <Pressable
              key={swatch}
              accessibilityLabel={swatch}
              onPress={() => setColor(swatch)}
              style={[
                styles.swatch,
                { backgroundColor: swatch },
                swatch === color && { borderColor: theme.text },
              ]}
            />
          ))}
        </View>

        {backends && (
          <>
            <ThemedText type="smallBold">Backend</ThemedText>
            {backends.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                Connect to a backend in the settings first.
              </ThemedText>
            )}
            <View style={styles.colors}>
              {backends.map((backend) => (
                <Pressable
                  key={backend.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: backend.id === backendId }}
                  onPress={() => setBackendId(backend.id)}>
                  <ThemedView
                    type={backend.id === backendId ? 'backgroundSelected' : 'backgroundElement'}
                    style={styles.button}>
                    <ThemedText type={backend.id === backendId ? 'smallBold' : 'small'}>
                      {backend.name}
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Pressable disabled={!canSave} onPress={save} style={styles.save}>
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
  preview: {
    alignSelf: 'center',
    marginBottom: Spacing.two,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  unselected: {
    opacity: 0.5,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'transparent',
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
