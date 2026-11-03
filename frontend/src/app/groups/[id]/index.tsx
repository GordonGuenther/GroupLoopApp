import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { confirm, inform } from '@/components/dialogs';
import { GroupImage } from '@/components/group-image';
import { HeaderMenu } from '@/components/header-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { GroupMember } from '@/db/database';
import { deleteGroup, removeMember, useGroup, useGroupMembers, useUser } from '@/db/groups';
import { useTheme } from '@/hooks/use-theme';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const group = useGroup(id);
  const members = useGroupMembers(id);
  const userId = useUser(group?.backend_id)?.id;

  // Pending invitations are listed, but only accepted members count.
  const active = members?.filter((member) => member.status === 'active') ?? [];
  const me = active.find((member) => member.user_id === userId);
  const isFull = me?.role === 'full';
  const fullCount = active.filter((member) => member.role === 'full').length;
  const memberCount = active.length;
  const groupName = group?.name ?? 'this group';

  const confirmDelete = () =>
    confirm(
      'Delete group?',
      memberCount > 1
        ? `${groupName} will be deleted for all ${memberCount} members. This cannot be undone.`
        : `${groupName} will be deleted. This cannot be undone.`,
      'Delete',
      async () => {
        await deleteGroup(id);
        router.back();
      }
    );

  const remove = (member: GroupMember) => {
    if (member.status === 'pending') {
      confirm(
        'Revoke invitation?',
        `${member.email} will not be able to join ${groupName}.`,
        'Revoke',
        () => removeMember(member.id)
      );
      return;
    }
    const isMe = member.user_id === userId;
    if (isMe && memberCount === 1) {
      confirm(
        'Leave and delete group?',
        `You are the last member, so ${groupName} will be deleted. This cannot be undone.`,
        'Leave and delete',
        async () => {
          await deleteGroup(id);
          router.back();
        }
      );
      return;
    }
    if (isMe && member.role === 'full' && fullCount === 1) {
      inform(
        "You can't leave this group",
        'The other members need at least one read-write member. You can delete the group instead.'
      );
      return;
    }
    confirm(
      isMe ? 'Leave group?' : 'Remove member?',
      isMe
        ? `You will no longer see ${groupName}.`
        : `${member.email ?? 'This member'} will no longer see ${groupName}.`,
      isMe ? 'Leave' : 'Remove',
      async () => {
        await removeMember(member.id);
        if (isMe) router.back();
      }
    );
  };

  if (group === null) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">This group does not exist.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: group?.name ?? '',
          headerRight: isFull
            ? () => (
                <HeaderMenu
                  label="Group menu"
                  items={[
                    { label: 'Edit group', onPress: () => router.push(`/groups/${id}/edit`) },
                    { label: 'Add members', onPress: () => router.push(`/groups/${id}/invite`) },
                    { label: 'Delete group', onPress: confirmDelete, destructive: true },
                  ]}
                />
              )
            : undefined,
        }}
      />
      {group && (
        <ThemedView style={styles.container}>
          <View style={styles.header}>
            <GroupImage image={group.image} color={group.color} size={160} />
            <ThemedText type="subtitle" style={styles.centerText}>
              {group.name}
            </ThemedText>
          </View>

          <ThemedText type="smallBold">Members</ThemedText>
          {members?.map((member) => {
            const pending = member.status === 'pending';
            const canRemove = isFull || (!pending && member.user_id === userId);
            return (
              <ThemedView
                key={member.id}
                type="backgroundElement"
                style={[styles.member, pending && styles.pending]}>
                <SymbolView
                  tintColor={theme.textSecondary}
                  name={
                    member.role === 'full'
                      ? { ios: 'pencil', android: 'edit', web: 'edit' }
                      : { ios: 'eye', android: 'visibility', web: 'visibility' }
                  }
                  size={18}
                />
                <View style={styles.memberText}>
                  <ThemedText type="small" numberOfLines={1}>
                    {member.email ?? 'Unknown'}
                    {member.user_id === userId && ' (you)'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {pending && 'Invitation pending · '}
                    {member.role === 'full' ? 'Read & write' : 'Read only'}
                  </ThemedText>
                </View>
                {canRemove && (
                  <Pressable
                    accessibilityLabel={
                      pending
                        ? 'Revoke invitation'
                        : member.user_id === userId
                          ? 'Leave group'
                          : 'Remove member'
                    }
                    onPress={() => remove(member)}
                    hitSlop={Spacing.two}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <SymbolView
                      tintColor={theme.textSecondary}
                      name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                      size={18}
                    />
                  </Pressable>
                )}
              </ThemedView>
            );
          })}
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
    gap: Spacing.two,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  memberText: {
    flex: 1,
    gap: Spacing.half,
  },
  pending: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
