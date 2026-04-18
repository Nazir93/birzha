import { randomUuid } from "../lib/random-uuid.js";
import type { OutboxItem } from "./types.js";
import { getFallbackStorage } from "./fallback-storage.js";
import { getOutboxScopeKey } from "./outbox-scope.js";
import type { StorageLike } from "./storage-types.js";

/** Ключ очереди в `localStorage` для текущей области (без входа — прежний `birzha:outbox:v1`). */
export function getOutboxStorageKey(): string {
  const scope = getOutboxScopeKey();
  if (scope === "default") {
    return "birzha:outbox:v1";
  }
  return `birzha:outbox:v1:${scope}`;
}

/** Стабильный ключ для тестов при `syncOutboxScopeTo("default")`. */
export const OUTBOX_STORAGE_KEY = "birzha:outbox:v1";

export type { StorageLike } from "./storage-types.js";

function defaultStorage(): StorageLike {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return getFallbackStorage();
}

export function loadOutboxSync(storage: StorageLike = defaultStorage()): OutboxItem[] {
  const raw = storage.getItem(getOutboxStorageKey());
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as OutboxItem[];
  } catch {
    return [];
  }
}

function saveOutbox(items: OutboxItem[], storage: StorageLike): void {
  storage.setItem(getOutboxStorageKey(), JSON.stringify(items));
}

export type EnqueueInput = Omit<OutboxItem, "createdAt" | "localActionId"> & {
  localActionId?: string;
};

/** FIFO: новые в конец. */
export function enqueueSync(item: EnqueueInput, storage: StorageLike = defaultStorage()): OutboxItem {
  const queue = loadOutboxSync(storage);
  const row: OutboxItem = {
    ...item,
    localActionId: item.localActionId ?? randomUuid(),
    createdAt: Date.now(),
  };
  queue.push(row);
  saveOutbox(queue, storage);
  return row;
}

/** Удалить первый элемент (после успешной синхронизации). */
export function dequeueHeadSync(storage: StorageLike = defaultStorage()): OutboxItem | undefined {
  const queue = loadOutboxSync(storage);
  const first = queue.shift();
  if (first) {
    saveOutbox(queue, storage);
  }
  return first;
}

export function peekHeadSync(storage: StorageLike = defaultStorage()): OutboxItem | undefined {
  const queue = loadOutboxSync(storage);
  return queue[0];
}

export function outboxLengthSync(storage: StorageLike = defaultStorage()): number {
  return loadOutboxSync(storage).length;
}

/** Сброс очереди (только для тестов / отладки). */
export function clearOutboxSync(storage: StorageLike = defaultStorage()): void {
  storage.setItem(getOutboxStorageKey(), "[]");
}
