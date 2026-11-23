/**
 * MMKV keys that tvOS must not lose when it empties the app's caches. On tvOS
 * react-native-mmkv keeps its file in Library/Caches, which the system purges
 * between launches when it needs space; these keys are mirrored to the
 * Keychain and restored from it (utils/durableStorage.ts). Only string values
 * are kept, and only what the app cannot rebuild: the session, the saved
 * servers and their accounts, the server picked on the TV login screen, and
 * the user's settings.
 */
export const DURABLE_STORAGE_KEYS = [
  "serverUrl",
  "token",
  "user",
  "previousServers",
  "selectedTVServer",
  "settings",
] as const;

/** Prefix of a durable key's Keychain copy, so it never meets another item. */
export const DURABLE_STORAGE_BACKUP_PREFIX = "mmkv_durable_";
