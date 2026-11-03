import 'expo-sqlite/localStorage/install';

import * as Crypto from 'expo-crypto';
import type { HashFunction } from 'rxdb';
import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage';

// RxDB's localStorage storage listens for browser 'storage' events whenever `window`
// exists. React Native has a `window` global, but no event API on it.
if (typeof window.addEventListener !== 'function') {
  window.addEventListener = () => {};
}

// Hermes has no crypto.subtle, which RxDB's default hash function relies on.
const hashFunction: HashFunction = async (input) => {
  if (typeof input === 'string') {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
  }
  const buffer = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buffer));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Backed by expo-sqlite's localStorage implementation. */
export const platformOptions = {
  storage: getRxStorageLocalstorage(),
  hashFunction,
  multiInstance: false,
};
