import * as SecureStore from "expo-secure-store";
import type { MMKV } from "react-native-mmkv";
import {
  DURABLE_STORAGE_BACKUP_PREFIX,
  DURABLE_STORAGE_KEYS,
} from "@/constants/DurableStorage";

type Storage = Pick<
  MMKV,
  "set" | "remove" | "contains" | "clearAll" | "getString"
>;

const durableKeys = new Set<string>(DURABLE_STORAGE_KEYS);

// Readable whenever the app runs, also when the system launches it in the
// background, like the saved account credentials.
const WRITE_OPTIONS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

// The store is a Nitro hybrid object whose methods live on its prototype,
// where plain assignment can be refused; an own property shadows them either way.
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

const backupKey = (key: string) => `${DURABLE_STORAGE_BACKUP_PREFIX}${key}`;

// Storage must never fail because its copy did: the copy only matters after a
// purge, and a failed Keychain call is no reason to lose the write itself.
// Nothing is logged here: utils/log writes to this same storage.
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
 * Keeps the durable keys of `storage` across a purge of tvOS's caches: puts
 * back from the Keychain each one the store no longer holds, then mirrors
 * every later write and removal of them to it. Must run before anything reads
 * the store, so utils/mmkv.ts calls it where the store is created.
 *
 * Without it, a tvOS that empties Library/Caches while the app is not running
 * takes the server, the session, the saved servers and the settings with it,
 * and the app opens on the server setup screen (streamyfin#2390).
 */
export const keepDurableKeysAcrossPurges = (storage: Storage) => {
  for (const key of DURABLE_STORAGE_KEYS) {
    quietly(() => {
      const saved = SecureStore.getItem(backupKey(key));
      if (!storage.contains(key)) {
        if (saved !== null) storage.set(key, saved);
        return;
      }
      // Still here: copy it if the Keychain has not got it yet, as on the
      // first launch of a build with this fix, which a purge must not undo.
      const current = storage.getString(key);
      if (current !== undefined && current !== saved) {
        SecureStore.setItem(backupKey(key), current, WRITE_OPTIONS);
      }
    });
  }

  const set = storage.set.bind(storage);
  const remove = storage.remove.bind(storage);
  const clearAll = storage.clearAll.bind(storage);

  override(storage, "set", (key, value) => {
    set(key, value);
    if (!durableKeys.has(key)) return;
    if (typeof value === "string") {
      quietly(() => SecureStore.setItem(backupKey(key), value, WRITE_OPTIONS));
    } else {
      // Not a value this keeps: a stale copy would come back after a purge.
      forget(key);
    }
  });

  override(storage, "remove", (key) => {
    const removed = remove(key);
    if (durableKeys.has(key)) forget(key);
    return removed;
  });

  override(storage, "clearAll", () => {
    clearAll();
    for (const key of DURABLE_STORAGE_KEYS) forget(key);
  });
};
