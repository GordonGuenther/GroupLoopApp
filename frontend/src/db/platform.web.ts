import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

/** Backed by IndexedDB. */
export const platformOptions = {
  storage: getRxStorageDexie(),
};
