/**
 * MMKV keys whose values the app cannot rebuild, kept in the Keychain as well
 * on tvOS so a purge of its caches does not lose them (utils/durableStorage.ts):
 * the session, the saved servers and their accounts, the server picked on the
 * TV login screen, and the settings. Their values must be strings.
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
