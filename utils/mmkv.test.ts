import type { createMMKV } from "react-native-mmkv";
import { requireOnPlatform } from "@/test-utils/reactNative";

// utils/mmkv.ts reads Platform when it loads, so each case loads its own copy,
// and with it its own Keychain double: the one this file imports is another.
const loadOn = (platform: Parameters<typeof requireOnPlatform>[0]) =>
  requireOnPlatform(platform, () => ({
    storage: require("./mmkv").storage as ReturnType<typeof createMMKV>,
    keychain: require("@/test-utils/secureStore").secureStoreValues as Map<
      string,
      string
    >,
  }));

describe("storage", () => {
  it("keeps the session in the Keychain on tvOS, whose MMKV file is in a cache", () => {
    const { storage, keychain } = loadOn({ OS: "ios", isTV: true });

    storage.set("token", "abc123");

    expect(keychain.get("mmkv_durable_token")).toBe("abc123");
  });

  it.each([
    ["an iPhone", { OS: "ios" as const, isTV: false }],
    ["Android TV", { OS: "android" as const, isTV: true }],
  ])(
    "leaves the Keychain alone on %s, whose MMKV file is permanent",
    (_, platform) => {
      const { storage, keychain } = loadOn(platform);

      storage.set("token", "abc123");

      expect(keychain.has("mmkv_durable_token")).toBe(false);
    },
  );
});
