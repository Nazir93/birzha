import {
  clearOutboxSync,
  dequeueHeadSync,
  enqueueSync,
  loadOutboxSync,
  outboxLengthSync,
  peekHeadSync,
  type EnqueueInput,
} from "./outbox-queue.js";
import {
  getOutboxIdb,
  hasIndexedDb,
  idbClearOutbox,
  idbDequeueHead,
  idbEnqueue,
  idbLoadOutbox,
  idbOutboxLength,
  idbPeekHead,
} from "./outbox-idb.js";
import { getFallbackStorage } from "./fallback-storage.js";
import type { StorageLike } from "./storage-types.js";
import type { OutboxItem } from "./types.js";

export type OutboxBackend = {
  loadOutbox(): Promise<OutboxItem[]>;
  enqueue(item: EnqueueInput): Promise<OutboxItem>;
  dequeueHead(): Promise<OutboxItem | undefined>;
  peekHead(): Promise<OutboxItem | undefined>;
  outboxLength(): Promise<number>;
  clearOutbox(): Promise<void>;
};

function defaultStorage(): StorageLike {
  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return getFallbackStorage();
}

export function createStorageOutboxBackend(storage: StorageLike): OutboxBackend {
  return {
    loadOutbox: () => Promise.resolve(loadOutboxSync(storage)),
    enqueue: (item) => Promise.resolve(enqueueSync(item, storage)),
    dequeueHead: () => Promise.resolve(dequeueHeadSync(storage)),
    peekHead: () => Promise.resolve(peekHeadSync(storage)),
    outboxLength: () => Promise.resolve(outboxLengthSync(storage)),
    clearOutbox: async () => {
      clearOutboxSync(storage);
    },
  };
}

function createIndexedDbOutboxBackend(): OutboxBackend {
  return {
    loadOutbox: idbLoadOutbox,
    enqueue: idbEnqueue,
    dequeueHead: idbDequeueHead,
    peekHead: idbPeekHead,
    outboxLength: idbOutboxLength,
    clearOutbox: idbClearOutbox,
  };
}

/** Одна попытка: открыть IDB или перейти на `localStorage`/память. */
let resolvedDefaultBackend: Promise<OutboxBackend> | null = null;

function resolveDefaultBackend(): Promise<OutboxBackend> {
  if (!resolvedDefaultBackend) {
    resolvedDefaultBackend = (async (): Promise<OutboxBackend> => {
      if (!hasIndexedDb()) {
        return createStorageOutboxBackend(defaultStorage());
      }
      try {
        await getOutboxIdb();
        return createIndexedDbOutboxBackend();
      } catch {
        return createStorageOutboxBackend(defaultStorage());
      }
    })();
  }
  return resolvedDefaultBackend;
}

function createLazyDefaultOutboxBackend(): OutboxBackend {
  return {
    loadOutbox: async () => (await resolveDefaultBackend()).loadOutbox(),
    enqueue: async (item) => (await resolveDefaultBackend()).enqueue(item),
    dequeueHead: async () => (await resolveDefaultBackend()).dequeueHead(),
    peekHead: async () => (await resolveDefaultBackend()).peekHead(),
    outboxLength: async () => (await resolveDefaultBackend()).outboxLength(),
    clearOutbox: async () => (await resolveDefaultBackend()).clearOutbox(),
  };
}

let cachedDefault: OutboxBackend | null = null;

/**
 * В браузере с IndexedDB — ленивая инициализация: при ошибке открытия БД очередь в `localStorage`/памяти.
 * Без API IndexedDB — сразу `localStorage`/память.
 */
export function getDefaultOutboxBackend(): OutboxBackend {
  if (cachedDefault) {
    return cachedDefault;
  }
  if (hasIndexedDb()) {
    cachedDefault = createLazyDefaultOutboxBackend();
  } else {
    cachedDefault = createStorageOutboxBackend(defaultStorage());
  }
  return cachedDefault;
}

/** Сброс ленивого бэкенда (смена пользователя / области очереди). */
export function resetDefaultOutboxBackendCache(): void {
  cachedDefault = null;
  resolvedDefaultBackend = null;
}

/** @alias resetDefaultOutboxBackendCache */
export function resetDefaultOutboxBackendCacheForTests(): void {
  resetDefaultOutboxBackendCache();
}
