import { getFallbackStorage } from "./fallback-storage.js";
import type { StorageLike } from "./storage-types.js";

const DEVICE_KEY = "birzha:deviceId";

function defaultStorage(): StorageLike {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return getFallbackStorage();
}

/** Стабильный идентификатор устройства для идемпотентности sync. */
export function getOrCreateDeviceId(storage: StorageLike = defaultStorage()): string {
  const existing = storage.getItem(DEVICE_KEY);
  if (existing && existing.length > 0) {
    return existing;
  }
  const id = crypto.randomUUID();
  storage.setItem(DEVICE_KEY, id);
  return id;
}
