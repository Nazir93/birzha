import { randomUuid } from "../lib/random-uuid.js";
import { getFallbackStorage } from "./fallback-storage.js";
import { getOutboxScopeKey } from "./outbox-scope.js";
import type { StorageLike } from "./storage-types.js";

function deviceIdStorageKey(): string {
  return `birzha:deviceId:${getOutboxScopeKey()}`;
}

function defaultStorage(): StorageLike {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return getFallbackStorage();
}

/** Стабильный идентификатор устройства для идемпотентности sync. */
export function getOrCreateDeviceId(storage: StorageLike = defaultStorage()): string {
  const key = deviceIdStorageKey();
  const existing = storage.getItem(key);
  if (existing && existing.length > 0) {
    return existing;
  }
  const id = randomUuid();
  storage.setItem(key, id);
  return id;
}
