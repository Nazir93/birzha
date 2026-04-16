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

let cachedDefault: OutboxBackend | null = null;

/** В браузере — IndexedDB (с миграцией из `localStorage`); иначе — память / `localStorage`. */
export function getDefaultOutboxBackend(): OutboxBackend {
  if (cachedDefault) {
    return cachedDefault;
  }
  if (hasIndexedDb()) {
    cachedDefault = createIndexedDbOutboxBackend();
  } else {
    cachedDefault = createStorageOutboxBackend(defaultStorage());
  }
  return cachedDefault;
}

/** Только для тестов: сброс выбранного дефолтного бэкенда (после `resetOutboxIdbForTests` и т.п.). */
export function resetDefaultOutboxBackendCacheForTests(): void {
  cachedDefault = null;
}
