import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { GroupMember } from '@/db/database';
import { inviteMembers, useGroupMembers } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

type Row = { key: string; email: string; role: GroupMember['role'] };

const newRow = (): Row => ({ key: Crypto.randomUUID(), email: '', role: 'read' });

export default function InviteMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const members = useGroupMembers(id);
  const [rows, setRows] = useState(() => [newRow()]);

  const known = new Set(members?.map((member) => member.email));
  const emailOf = (row: Row) => row.email.trim().toLowerCase();
  const problem = (row: Row, index: number) => {
    const email = emailOf(row);
    if (email === '') return undefined;
    if (!isEmail(email)) return 'Not a valid email address.';
    if (known.has(email)) return 'Already a member or invited.';
    if (rows.slice(0, index).some((other) => emailOf(other) === email)) return 'Listed twice.';
  };

  const filled = rows.filter((row) => emailOf(row) !== '');
  const canSave = filled.length > 0 && rows.every((row, index) => !problem(row, index));

  const update = (key: string, change: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));

  const save = async () => {
    await inviteMembers(
      id,
      filled.map((row) => ({ email: emailOf(row), role: row.role }))
    );
    router.back();
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <ThemedView style={styles.container}>
        <ThemedText type="small" themeColor="textSecondary">
          Invited people join once they accept. People without an account get an email that
          explains how to connect to this backend.
        </ThemedText>

        {rows.map((row, index) => (
          <View key={row.key} style={styles.row}>
            <View style={styles.emailLine}>
              <TextInput
                value={row.email}
                onChangeText={(email) => update(row.key, { email })}
                placeholder="name@example.com"
                placeholderTextColor={theme.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus={index === rows.length - 1}
                style={[
                  styles.input,
                  { color: theme.text, backgroundColor: theme.backgroundElement },
                ]}
              />
              {rows.length > 1 && (
                <Pressable
                  accessibilityLabel="Remove"
                  onPress={() => setRows(rows.filter((other) => other.key !== row.key))}
                  hitSlop={Spacing.two}>
                  <SymbolView
                    tintColor={theme.textSecondary}
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={18}
                  />
                </Pressable>
              )}
            </View>
            <View style={styles.roles}>
              <RoleOption
                label="Read only"
                icon={{ ios: 'eye', android: 'visibility', web: 'visibility' }}
                selected={row.role === 'read'}
                onPress={() => update(row.key, { role: 'read' })}
              />
              <RoleOption
                label="Read & write"
                icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                selected={row.role === 'full'}
                onPress={() => update(row.key, { role: 'full' })}
              />
            </View>
            {problem(row, index) && (
              <ThemedText type="small" themeColor="textSecondary">
                {problem(row, index)}
              </ThemedText>
            )}
          </View>
        ))}

        <Pressable
          onPress={() => setRows([...rows, newRow()])}
          style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}>
          <SymbolView
            tintColor={theme.text}
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={14}
          />
          <ThemedText type="small">Add another</ThemedText>
        </Pressable>

        <Pressable disabled={!canSave} onPress={save} style={styles.save}>
          <ThemedView type="backgroundSelected" style={[styles.button, !canSave && styles.disabled]}>
            <ThemedText type="smallBold">Invite</ThemedText>
          </ThemedView>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

type RoleOptionProps = {
  label: string;
  icon: React.ComponentProps<typeof SymbolView>['name'];
  selected: boolean;
  onPress: () => void;
};

function RoleOption({ label, icon, selected, onPress }: RoleOptionProps) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress}>
      <ThemedView
        type={selected ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.roleOption}>
        <SymbolView
          tintColor={selected ? theme.text : theme.textSecondary}
          name={icon}
          size={14}
        />
        <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    gap: Spacing.two,
  },
  emailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  roles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.five,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    alignSelf: 'flex-start',
  },
  save: {
    alignSelf: 'flex-start',
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
