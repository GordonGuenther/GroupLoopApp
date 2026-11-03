import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { GroupImage } from '@/components/group-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { acceptInvitation, removeMember, usePendingInvitations } from '@/db/groups';

/**
 * Asks the user to accept or decline their pending group invitations, one after another.
 * It cannot be dismissed, and comes back on every start until each one is answered.
 */
export function InvitationPrompt() {
  const invitations = usePendingInvitations();
  const [busy, setBusy] = useState(false);

  const current = invitations?.[0];
  if (!current) return null;
  const { invitation, group, user } = current;

  const answer = async (accept: boolean) => {
    setBusy(true);
    try {
      if (accept) await acceptInvitation(invitation.id, user.id);
      else await removeMember(invitation.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.dialog}>
          <GroupImage image={group.image} color={group.color} size={120} />
          <ThemedText type="subtitle" style={styles.centerText}>
            {group.name}
          </ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            {invitation.invited_by_email ?? 'Someone'} invited you to join as a{' '}
            {invitation.role === 'full' ? 'read & write' : 'read-only'} member.
          </ThemedText>
          {invitations.length > 1 && (
            <ThemedText type="small" themeColor="textSecondary">
              {invitations.length - 1} more invitation{invitations.length > 2 && 's'} waiting
            </ThemedText>
          )}
          <View style={styles.buttons}>
            <Pressable disabled={busy} onPress={() => answer(false)}>
              <ThemedView type="backgroundElement" style={[styles.button, busy && styles.busy]}>
                <ThemedText type="smallBold">Decline</ThemedText>
              </ThemedView>
            </Pressable>
            <Pressable disabled={busy} onPress={() => answer(true)}>
              <View style={[styles.button, { backgroundColor: group.color }, busy && styles.busy]}>
                <ThemedText type="smallBold" style={styles.acceptText}>
                  Accept
                </ThemedText>
              </View>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.five,
  },
  acceptText: {
    color: '#fff',
  },
  busy: {
    opacity: 0.4,
  },
});
