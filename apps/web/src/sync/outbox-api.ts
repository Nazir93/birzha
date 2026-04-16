import { getDefaultOutboxBackend } from "./outbox-backend.js";
import { enqueueSync, loadOutboxSync, type EnqueueInput } from "./outbox-queue.js";
import type { StorageLike } from "./storage-types.js";
import type { OutboxItem } from "./types.js";

/** По умолчанию — IndexedDB в браузере (с миграцией из `localStorage`), иначе синхронное хранилище. */
export function loadOutbox(storage?: StorageLike): Promise<OutboxItem[]> {
  if (storage !== undefined) {
    return Promise.resolve(loadOutboxSync(storage));
  }
  return getDefaultOutboxBackend().loadOutbox();
}

export function enqueue(item: EnqueueInput, storage?: StorageLike): Promise<OutboxItem> {
  if (storage !== undefined) {
    return Promise.resolve(enqueueSync(item, storage));
  }
  return getDefaultOutboxBackend().enqueue(item);
}
