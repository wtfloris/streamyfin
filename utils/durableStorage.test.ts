import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import * as SecureStore from "expo-secure-store";
import { createMMKV } from "react-native-mmkv";
import { DURABLE_STORAGE_KEYS } from "@/constants/DurableStorage";
import { clearMmkv } from "@/test-utils/mmkv";
import {
  clearSecureStore,
  lockSecureStore,
  secureStoreValues,
} from "@/test-utils/secureStore";
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
  // A failed Keychain copy is warned about; the specs below cause some.
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("keepDurableKeysAcrossPurges", () => {
  it("brings back the server, session, saved servers and settings after tvOS purges its caches", () => {
    const first = launch();
    first.set("serverUrl", "http://jellyfin.local:8096");
    first.set("token", "abc123");
    first.set("user", '{"Id":"u1","Name":"me"}');
    first.set("previousServers", '[{"address":"http://jellyfin.local:8096"}]');
    first.set("selectedTVServer", '{"address":"http://jellyfin.local:8096"}');
    first.set("settings", '{"subtitleSize":80}');

    purgeCaches();
    const next = launch();

    expect(next.getString("serverUrl")).toBe("http://jellyfin.local:8096");
    expect(next.getString("token")).toBe("abc123");
    expect(next.getString("user")).toBe('{"Id":"u1","Name":"me"}');
    expect(next.getString("previousServers")).toBe(
      '[{"address":"http://jellyfin.local:8096"}]',
    );
    expect(next.getString("selectedTVServer")).toBe(
      '{"address":"http://jellyfin.local:8096"}',
    );
    expect(next.getString("settings")).toBe('{"subtitleSize":80}');
  });

  it("keeps a session saved before the fix existed, on the launch that brings it", () => {
    // Written by an older build, so only in MMKV.
    createMMKV().set("serverUrl", "http://jellyfin.local:8096");

    launch();
    purgeCaches();

    expect(launch().getString("serverUrl")).toBe("http://jellyfin.local:8096");
  });

  it("does not bring back a signed out session", async () => {
    const first = launch();
    first.set("serverUrl", "http://jellyfin.local:8096");
    first.set("token", "abc123");
    first.remove("token");
    await Promise.resolve();

    purgeCaches();
    const next = launch();

    expect(next.getString("serverUrl")).toBe("http://jellyfin.local:8096");
    expect(next.contains("token")).toBe(false);
  });

  it("brings back the latest value, not the first", () => {
    const first = launch();
    first.set("serverUrl", "http://old.local");
    first.set("serverUrl", "http://new.local");

    purgeCaches();

    expect(launch().getString("serverUrl")).toBe("http://new.local");
  });

  it("forgets everything after clearAll", async () => {
    const first = launch();
    first.set("token", "abc123");
    first.clearAll();
    await Promise.resolve();

    purgeCaches();

    expect(launch().contains("token")).toBe(false);
  });

  it("leaves keys the app can rebuild in the cache only", () => {
    launch().set("REACT_QUERY_OFFLINE_CACHE", "{}");

    expect([...secureStoreValues.keys()]).toEqual([]);
  });

  it("still writes to storage when the Keychain refuses", () => {
    const storage = launch();
    jest.spyOn(SecureStore, "setItem").mockImplementation(() => {
      throw new Error("Keychain unavailable");
    });

    expect(() => storage.set("token", "abc123")).not.toThrow();
    expect(storage.getString("token")).toBe("abc123");
  });

  it("does not stop the launch when a Keychain copy cannot be read", () => {
    launch().set("token", "abc123");
    purgeCaches();
    // Stored readable only while unlocked, by a build before this one.
    secureStoreValues.set("mmkv_durable_serverUrl", "http://jellyfin.local");
    lockSecureStore();

    expect(() => launch()).not.toThrow();
  });
});

describe("DURABLE_STORAGE_KEYS", () => {
  const root = join(__dirname, "..");
  const SOURCE_DIRECTORIES = [
    "app",
    "components",
    "hooks",
    "providers",
    "utils",
  ];
  const SOURCE_FILE = /\.tsx?$/;
  const SPEC_FILE = /\.(test|perf-test)\.tsx?$/;

  const sourceFiles = (directory: string): string[] =>
    readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
      (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return SOURCE_FILE.test(entry.name) && !SPEC_FILE.test(entry.name)
          ? [path]
          : [];
      },
    );

  // The keys are written where they are owned, as plain strings; a renamed key
  // would leave this list naming nothing, and tvOS would lose it again.
  it.each(DURABLE_STORAGE_KEYS)(
    "names %s, a key the app still writes",
    (key) => {
      const owners = SOURCE_DIRECTORIES.flatMap(sourceFiles).filter((path) =>
        readFileSync(join(root, path), "utf8").includes(`"${key}"`),
      );

      expect(owners.map((path) => relative(root, path))).not.toEqual([]);
    },
  );
});
