import { randomUuid } from "../lib/random-uuid.js";
import { getOutboxStorageKey, type EnqueueInput } from "./outbox-queue.js";
import { indexedDbNameForScope } from "./outbox-names.js";
import { getOutboxScopeKey } from "./outbox-scope.js";
import type { OutboxItem } from "./types.js";

export function getOutboxIndexedDbName(): string {
  return indexedDbNameForScope(getOutboxScopeKey());
}

/** @deprecated используйте `getOutboxIndexedDbName()` */
export const OUTBOX_IDB_NAME = "birzha-offline";
const DB_VERSION = 1;
const STORE_OUTBOX = "outbox";
const STORE_META = "meta";
const META_KEY_MIGRATED_LS = "migratedFromLocalStorageOutboxV1";

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDb(): Promise<IDBDatabase> {
  const dbName = getOutboxIndexedDbName();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        db.createObjectStore(STORE_OUTBOX, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
  });
}

async function readMetaFlag(db: IDBDatabase, key: string): Promise<boolean> {
  const tx = db.transaction(STORE_META, "readonly");
  const store = tx.objectStore(STORE_META);
  const row = await requestToPromise(store.get(key));
  await txDone(tx);
  return Boolean(row && typeof row === "object" && "value" in row && (row as { value: unknown }).value === true);
}

function readLegacyLocalStorageOutbox(): OutboxItem[] {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis) || !globalThis.localStorage) {
    return [];
  }
  const raw = globalThis.localStorage.getItem(getOutboxStorageKey());
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

async function migrateFromLocalStorageIfNeeded(db: IDBDatabase): Promise<void> {
  if (getOutboxScopeKey() !== "default") {
    return;
  }
  if (await readMetaFlag(db, META_KEY_MIGRATED_LS)) {
    return;
  }
  const legacy = readLegacyLocalStorageOutbox();
  const tx = db.transaction([STORE_META, STORE_OUTBOX], "readwrite");
  const outbox = tx.objectStore(STORE_OUTBOX);
  const meta = tx.objectStore(STORE_META);

  for (const item of legacy) {
    outbox.add(item);
  }
  meta.put({ key: META_KEY_MIGRATED_LS, value: true });

  await txDone(tx);

  if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
    const k = getOutboxStorageKey();
    if (globalThis.localStorage.getItem(k) !== null) {
      globalThis.localStorage.removeItem(k);
    }
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Закрыть текущее соединение (при смене пользователя / области). */
export function resetOutboxIdbConnection(): void {
  if (dbPromise) {
    void dbPromise
      .then((db) => {
        db.close();
      })
      .catch(() => {
        /* ignore */
      });
  }
  dbPromise = null;
}

export async function getOutboxIdb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    throw new Error("IndexedDB is not available");
  }
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await openDb();
      await migrateFromLocalStorageIfNeeded(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function idbLoadOutbox(): Promise<OutboxItem[]> {
  const db = await getOutboxIdb();
  const tx = db.transaction(STORE_OUTBOX, "readonly");
  const store = tx.objectStore(STORE_OUTBOX);
  const all = await requestToPromise(store.getAll() as IDBRequest<OutboxItem[]>);
  await txDone(tx);
  return all;
}

export async function idbEnqueue(input: EnqueueInput): Promise<OutboxItem> {
  const db = await getOutboxIdb();
  const row = {
    ...input,
    localActionId: input.localActionId ?? randomUuid(),
    createdAt: Date.now(),
  } as OutboxItem;
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).add(row);
  await txDone(tx);
  return row;
}

export async function idbPeekHead(): Promise<OutboxItem | undefined> {
  const db = await getOutboxIdb();
  const tx = db.transaction(STORE_OUTBOX, "readonly");
  const store = tx.objectStore(STORE_OUTBOX);
  const cursor = await requestToPromise(store.openCursor());
  await txDone(tx);
  return cursor?.value as OutboxItem | undefined;
}

export async function idbDequeueHead(): Promise<OutboxItem | undefined> {
  const db = await getOutboxIdb();
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  const store = tx.objectStore(STORE_OUTBOX);
  const cursor = await requestToPromise(store.openCursor());
  if (!cursor) {
    await txDone(tx);
    return undefined;
  }
  const value = cursor.value as OutboxItem;
  await requestToPromise(cursor.delete());
  await txDone(tx);
  return value;
}

export async function idbOutboxLength(): Promise<number> {
  const db = await getOutboxIdb();
  const tx = db.transaction(STORE_OUTBOX, "readonly");
  const store = tx.objectStore(STORE_OUTBOX);
  const n = await requestToPromise(store.count());
  await txDone(tx);
  return n;
}

export async function idbClearOutbox(): Promise<void> {
  const db = await getOutboxIdb();
  const tx = db.transaction(STORE_OUTBOX, "readwrite");
  tx.objectStore(STORE_OUTBOX).clear();
  await txDone(tx);
}

export { hasIndexedDb };

/** Только для тестов: сброс кэша открытой БД и удаление IndexedDB. */
export async function resetOutboxIdbForTests(): Promise<void> {
  resetOutboxIdbConnection();
  if (!hasIndexedDb()) {
    return;
  }
  const name = getOutboxIndexedDbName();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
    req.onblocked = () => resolve();
  });
}
