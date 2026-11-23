import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import { clearMmkv } from "@/test-utils/mmkv";
import { clearSecureStore, secureStoreValues } from "@/test-utils/secureStore";
import { keepDurableKeysAcrossPurges } from "./durableStorage";

// One launch of the app: a fresh store over whatever file is left on disk.
const launch = () => {
  const storage = createMMKV();
  keepDurableKeysAcrossPurges(storage);
  return storage;
};

// tvOS emptying Library/Caches while the app is not running (streamyfin#2390).
const purgeCaches = () => clearMmkv();

beforeEach(() => {
  clearMmkv();
  clearSecureStore();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("keepDurableKeysAcrossPurges", () => {
  it("brings back the server, session, saved servers and settings after tvOS purges its caches", () => {
    const written = {
      serverUrl: "http://jellyfin.local:8096",
      token: "abc123",
      user: '{"Id":"u1","Name":"me"}',
      previousServers: '[{"address":"http://jellyfin.local:8096"}]',
      selectedTVServer: '{"address":"http://jellyfin.local:8096"}',
      settings: '{"subtitleSize":80}',
    };
    const first = launch();
    for (const [key, value] of Object.entries(written)) first.set(key, value);

    purgeCaches();
    const next = launch();

    for (const [key, value] of Object.entries(written)) {
      expect([key, next.getString(key)]).toEqual([key, value]);
    }
  });

  it("keeps a session saved by an older build through a purge before its next write", () => {
    createMMKV().set("serverUrl", "http://jellyfin.local:8096");

    launch();
    purgeCaches();

    expect(launch().getString("serverUrl")).toBe("http://jellyfin.local:8096");
  });

  it("does not bring back a signed out session", () => {
    const first = launch();
    first.set("token", "abc123");
    first.remove("token");

    purgeCaches();

    expect(launch().contains("token")).toBe(false);
  });

  it("does not bring back an old token after a sign-in that wrote none", () => {
    const first = launch();
    first.set("token", "abc123");
    first.set("token", undefined as unknown as string);

    purgeCaches();

    expect(launch().contains("token")).toBe(false);
  });

  it("keeps keys the app can rebuild out of the Keychain", () => {
    launch().set("REACT_QUERY_OFFLINE_CACHE", "{}");

    expect([...secureStoreValues.keys()]).toEqual([]);
  });

  it("still writes to storage when the Keychain refuses the copy", () => {
    const storage = launch();
    jest.spyOn(SecureStore, "setItem").mockImplementation(() => {
      throw new Error("Keychain unavailable");
    });

    storage.set("token", "abc123");

    expect(storage.getString("token")).toBe("abc123");
  });

  it("still launches when the Keychain cannot be read", () => {
    jest.spyOn(SecureStore, "getItem").mockImplementation(() => {
      throw new Error("Keychain unavailable");
    });

    expect(() => launch()).not.toThrow();
  });

  it("works on a store whose methods cannot be assigned, as on Nitro's prototype", () => {
    const methods = createMMKV();
    const prototype = {};
    for (const [name, value] of Object.entries(methods)) {
      Object.defineProperty(prototype, name, { value, writable: false });
    }
    const storage = Object.create(prototype) as typeof methods;

    keepDurableKeysAcrossPurges(storage);
    storage.set("token", "abc123");

    expect(secureStoreValues.get("mmkv_durable_token")).toBe("abc123");
  });
});
