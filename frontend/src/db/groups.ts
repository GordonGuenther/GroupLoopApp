import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { combineLatest, map, type Observable } from 'rxjs';

import { useSessions } from '@/auth';

import { getDatabase, type Group, type GroupMember } from './database';
import { useBackends } from './settings';

type Database = Awaited<ReturnType<typeof getDatabase>>;

/** The latest value of a database query. `undefined` while loading. */
function useQuery<T>(query: (db: Database) => Observable<T>, deps: unknown[]) {
  const [value, setValue] = useState<T>();

  useEffect(() => {
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    getDatabase().then((db) => {
      if (cancelled) return;
      subscription = query(db).subscribe(setValue);
    });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return value;
}

type User = { id: string; email?: string };

/** The signed-in user per backend id, `null` if signed out. `undefined` while loading. */
export function useUsers() {
  const sessions = useSessions(useBackends()?.backends);
  if (!sessions) return undefined;
  return Object.fromEntries(
    Object.entries(sessions).map(([backendId, session]): [string, User | null] => [
      backendId,
      session && { id: session.user.id, email: session.user.email?.toLowerCase() },
    ])
  );
}

/** The signed-in user of a backend, `null` if signed out. `undefined` while loading. */
export function useUser(backendId: string | undefined) {
  const users = useUsers();
  if (!users || backendId === undefined) return undefined;
  return users[backendId] ?? null;
}

/** All groups the user is a member of, with their role, by name. `undefined` while loading. */
export function useGroups() {
  const users = useUsers();
  const data = useQuery(
    (db) => combineLatest([db.groups.find().$, db.group_members.find().$]),
    []
  );
  if (!data || !users) return undefined;

  const [groups, members] = data;
  return (
    groups
      .map((doc) => doc.toJSON() as Group)
      // A group without members has not been synced yet, so the user just created it. Members
      // of a group the user was removed from stay on the device, but the user's own membership
      // is gone. Invitees only see the group once they accept.
      .flatMap((group) => {
        const groupMembers = members.filter((member) => member.group_id === group.id);
        if (groupMembers.length === 0) return [{ ...group, role: 'full' as const }];
        const user = users[group.backend_id];
        const me = groupMembers.find(
          (member) => member.user_id === user?.id && member.status === 'active'
        );
        return me ? [{ ...group, role: me.role }] : [];
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

/** One group, `null` if it does not exist. `undefined` while loading. */
export function useGroup(id: string) {
  return useQuery(
    (db) => db.groups.findOne(id).$.pipe(map((doc): Group | null => doc?.toJSON() ?? null)),
    [id]
  );
}

/** The members of a group, by email. `undefined` while loading. */
export function useGroupMembers(groupId: string) {
  const members = useQuery(
    (db) => db.group_members.find({ selector: { group_id: groupId } }).$,
    [groupId]
  );
  return members
    ?.map((doc): GroupMember => doc.toJSON())
    .sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
}

/** The user's pending invitations, with their groups and users. `undefined` while loading. */
export function usePendingInvitations() {
  const users = useUsers();
  const data = useQuery(
    (db) =>
      combineLatest([
        db.groups.find().$,
        db.group_members.find({ selector: { status: 'pending' } }).$,
      ]),
    []
  );
  if (!data || !users) return undefined;

  const [groups, invitations] = data;
  return invitations
    .map((doc): GroupMember => doc.toJSON())
    .flatMap((invitation) => {
      const user = users[invitation.backend_id];
      const group = groups.find((doc) => doc.id === invitation.group_id)?.toJSON();
      // The group arrives with the next sync, or it was deleted.
      return user && invitation.email === user.email && group
        ? [{ invitation, group: group as Group, user }]
        : [];
    });
}

type GroupValues = { name: string; color: string; image: string };

/** Adds a group to a backend. Its members and entries are saved there, too. */
export async function addGroup(group: GroupValues, backendId: string) {
  const db = await getDatabase();
  await db.groups.insert({ id: Crypto.randomUUID(), backend_id: backendId, ...group });
}

/** Invites people by email. They join once they accept. */
export async function inviteMembers(
  groupId: string,
  invitations: { email: string; role: GroupMember['role'] }[]
) {
  const db = await getDatabase();
  const group = await db.groups.findOne(groupId).exec();
  if (!group) return;
  await db.group_members.bulkInsert(
    invitations.map(({ email, role }) => ({
      id: Crypto.randomUUID(),
      backend_id: group.backend_id,
      group_id: groupId,
      email: email.toLowerCase(),
      role,
      status: 'pending' as const,
    }))
  );
}

export async function acceptInvitation(id: string, userId: string) {
  const db = await getDatabase();
  await (await db.group_members.findOne(id).exec())?.patch({ status: 'active', user_id: userId });
}

/** Removes a member from a group, the user themself included. Also revokes or declines invitations. */
export async function removeMember(id: string) {
  const db = await getDatabase();
  await (await db.group_members.findOne(id).exec())?.remove();
}

/** Deletes a group for all of its members. */
export async function deleteGroup(id: string) {
  const db = await getDatabase();
  await (await db.groups.findOne(id).exec())?.remove();
}

export async function updateGroup(id: string, group: GroupValues) {
  const db = await getDatabase();
  await (await db.groups.findOne(id).exec())?.patch(group);
}
