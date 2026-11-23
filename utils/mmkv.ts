import { Platform } from "react-native";
import { createMMKV } from "react-native-mmkv";
import { keepDurableKeysAcrossPurges } from "./durableStorage";

// Create a single MMKV instance following the official documentation
// https://github.com/mrousavy/react-native-mmkv
export const storage = createMMKV();

// Only tvOS keeps the MMKV file in a cache the system can empty.
if (Platform.OS === "ios" && Platform.isTV) {
  keepDurableKeysAcrossPurges(storage);
}
