import * as SecureStore from "expo-secure-store";
import type { MMKV } from "react-native-mmkv";
import {
  DURABLE_STORAGE_BACKUP_PREFIX,
  DURABLE_STORAGE_KEYS,
} from "@/constants/DurableStorage";

type Storage = Pick<MMKV, "set" | "remove" | "contains" | "getString">;

const durableKeys = new Set<string>(DURABLE_STORAGE_KEYS);

const backupKey = (key: string) => `${DURABLE_STORAGE_BACKUP_PREFIX}${key}`;

// The store's methods are read-only properties of its Nitro prototype, so
// assigning one throws; an own property defined on the instance shadows it.
const override = <K extends keyof Storage>(
  storage: Storage,
  name: K,
  value: Storage[K],
) =>
  Object.defineProperty(storage, name, {
    value,
    writable: true,
    configurable: true,
  });

// A failed Keychain copy must not fail the write it shadows. Warned, not
// logged: utils/log writes to this same storage.
const warn = (error: unknown) =>
  console.warn(
    "Durable storage copy failed:",
    error instanceof Error ? error.message : error,
  );

const quietly = (work: () => void) => {
  try {
    work();
  } catch (error) {
    warn(error);
  }
};

const forget = (key: string) =>
  quietly(() => {
    SecureStore.deleteItemAsync(backupKey(key)).catch(warn);
  });

/**
 * On tvOS react-native-mmkv keeps its file in Library/Caches, which the system
 * empties when it needs space, usually while the app is not running. This puts
 * back from the Keychain each durable key the store lost, then mirrors every
 * later write and removal of one to it. Without it the Apple TV app opens on
 * the server setup screen after a purge (streamyfin#2390). It must run before
 * anything reads the store.
 */
export const keepDurableKeysAcrossPurges = (storage: Storage) => {
  for (const key of DURABLE_STORAGE_KEYS) {
    quietly(() => {
      const saved = SecureStore.getItem(backupKey(key));
      if (!storage.contains(key)) {
        if (saved !== null) storage.set(key, saved);
        return;
      }
      // A value with no copy yet, as on the first launch after an update:
      // copy it now rather than at its next write, which a purge may beat.
      const current = storage.getString(key);
      if (current !== undefined && current !== saved) {
        SecureStore.setItem(backupKey(key), current);
      }
    });
  }

  const set = storage.set.bind(storage);
  const remove = storage.remove.bind(storage);

  override(storage, "set", (key, value) => {
    set(key, value);
    if (!durableKeys.has(key)) return;
    if (typeof value === "string") {
      quietly(() => SecureStore.setItem(backupKey(key), value));
    } else {
      // A sign-in with no token writes undefined; keeping the old copy would
      // bring the old token back after a purge.
      forget(key);
    }
  });

  override(storage, "remove", (key) => {
    const removed = remove(key);
    if (durableKeys.has(key)) forget(key);
    return removed;
  });
};
