import { apiFetch } from "../api/fetch-api.js";
import { createStorageOutboxBackend, getDefaultOutboxBackend, type OutboxBackend } from "./outbox-backend.js";
import { getOrCreateDeviceId } from "./device-id.js";
import type { StorageLike } from "./storage-types.js";
import type { OutboxItem, SyncResponse } from "./types.js";

/** За один вызов `processSyncQueue` не отправлять больше элементов (защита от долгого блокирования UI). */
export const PROCESS_SYNC_QUEUE_MAX_PER_RUN = 200;

export type ProcessSyncOptions = {
  /** По умолчанию POST на `/api/sync` (Vite proxy). */
  syncUrl?: string;
  /** Явный бэкенд очереди (тесты). */
  outbox?: OutboxBackend;
  /** Синхронное хранилище — оборачивается в `OutboxBackend` (тесты). */
  storage?: StorageLike;
  fetchImpl?: typeof fetch;
  /** Лимит успешных/принятых элементов за этот вызов; по умолчанию `PROCESS_SYNC_QUEUE_MAX_PER_RUN`. */
  maxPerRun?: number;
};

export type ProcessSyncStoppedReason = "empty" | "rejected" | "network_error" | "unauthorized" | "batch_limit";

export type ProcessSyncResult = {
  processed: number;
  stoppedReason: ProcessSyncStoppedReason;
  lastSync?: SyncResponse;
  /** Только при network_error / unauthorized — ответ не разобран. */
  httpStatus?: number;
};

function resolveOutbox(options: ProcessSyncOptions): OutboxBackend {
  if (options.outbox) {
    return options.outbox;
  }
  if (options.storage) {
    return createStorageOutboxBackend(options.storage);
  }
  return getDefaultOutboxBackend();
}

function buildRequestBody(deviceId: string, item: OutboxItem): Record<string, unknown> {
  return {
    deviceId,
    localActionId: item.localActionId,
    actionType: item.actionType,
    payload: item.payload,
  };
}

/**
 * Отправляет действия по одному (FIFO). При `rejected` или сетевой ошибке — стоп, голова очереди не удаляется.
 * Успех и `duplicate: true` снимают элемент с очереди.
 */
export async function processSyncQueue(options: ProcessSyncOptions = {}): Promise<ProcessSyncResult> {
  const syncUrl = options.syncUrl ?? "/api/sync";
  const outbox = resolveOutbox(options);
  const fetchFn = options.fetchImpl ?? apiFetch;
  const deviceId = getOrCreateDeviceId(options.storage);
  const maxPerRun = options.maxPerRun ?? PROCESS_SYNC_QUEUE_MAX_PER_RUN;

  let processed = 0;

  while ((await outbox.outboxLength()) > 0) {
    if (processed >= maxPerRun) {
      return { processed, stoppedReason: "batch_limit" };
    }
    const head = await outbox.peekHead();
    if (!head) {
      return { processed, stoppedReason: "empty" };
    }

    const body = buildRequestBody(deviceId, head);
    let res: Response;
    try {
      res = await fetchFn(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { processed, stoppedReason: "network_error" };
    }

    if (res.status === 401) {
      return { processed, stoppedReason: "unauthorized", httpStatus: res.status };
    }

    if (!res.ok) {
      return { processed, stoppedReason: "network_error", httpStatus: res.status };
    }

    const data = (await res.json()) as SyncResponse;

    if (data.status === "rejected") {
      return { processed, stoppedReason: "rejected", lastSync: data };
    }

    if (data.status === "ok") {
      await outbox.dequeueHead();
      processed += 1;
      continue;
    }

    return { processed, stoppedReason: "network_error" };
  }

  return { processed, stoppedReason: "empty" };
}
