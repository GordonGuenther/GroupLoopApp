import { router } from 'expo-router';

import { GroupForm } from '@/components/group-form';
import { addGroup, useUsers } from '@/db/groups';
import { useBackends } from '@/db/settings';

export default function AddGroupScreen() {
  const settings = useBackends();
  const users = useUsers();

  // The form keeps its own state, so it starts once the backends have loaded.
  if (!settings || !users) return null;
  // The default backend is preselected.
  const connected = settings.backends
    .filter((backend) => users[backend.id])
    .sort((a, b) => Number(b.id === settings.defaultId) - Number(a.id === settings.defaultId));

  return (
    <GroupForm
      backends={connected}
      onSave={async (group, backendId) => {
        await addGroup(group, backendId!);
        router.back();
      }}
    />
  );
}
