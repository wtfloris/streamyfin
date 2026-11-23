import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { keepDurableKeysAcrossPurges } from "./durableStorage";

// Create a single MMKV instance following the official documentation
// https://github.com/mrousavy/react-native-mmkv
export const storage = createMMKV();

// On tvOS react-native-mmkv writes to Library/Caches, which the system empties
// when it needs space, so the session and saved servers are kept in the
// Keychain as well. Android TV and phones keep the file in permanent storage.
if (Platform.OS === "ios" && Platform.isTV) {
  keepDurableKeysAcrossPurges(storage);
}
