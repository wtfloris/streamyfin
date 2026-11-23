# tvOS MMKV Lives in Purgeable Caches

**Date**: 2026-11-23
**Category**: tv
**Key files**: `utils/mmkv.ts`, `utils/durableStorage.ts`, `constants/DurableStorage.ts`

## Detail

tvOS gives apps no permanent Documents directory, so react-native-mmkv
(`ios/HybridMMKVPlatformContext.swift`) puts its file in `Library/Caches/mmkv`
there, and in Documents on iOS. tvOS empties Library/Caches whenever it needs
space, usually while the app is not running, and most often on a nearly full
Apple TV. Everything `createMMKV()` holds can be gone on the next launch.

The Keychain survives, so `utils/durableStorage.ts` mirrors the keys in
`DURABLE_STORAGE_KEYS` to it on tvOS and restores whichever are missing when
the store is created. A new MMKV key the app cannot rebuild (a server, an
account, a user choice) must be added to that list, or it will be lost on tvOS.
Only string values are mirrored.

## Symptom pattern

The Apple TV app opens on the server setup screen as if just installed, saved
servers and most settings gone, after the system terminated it during a long
standby. A force-quit or a reboot does not reproduce it
(streamyfin/streamyfin#2390).
