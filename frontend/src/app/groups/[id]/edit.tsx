import { router, useLocalSearchParams } from 'expo-router';

import { GroupForm } from '@/components/group-form';
import { updateGroup, useGroup } from '@/db/groups';

export default function EditGroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);

  // The form keeps its own state, so it starts once the group has loaded.
  if (!group) return null;

  return (
    <GroupForm
      initial={group}
      onSave={async (values) => {
        await updateGroup(id, values);
        router.back();
      }}
    />
  );
}
