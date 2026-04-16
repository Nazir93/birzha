import { processSyncQueue, type ProcessSyncOptions, type ProcessSyncResult } from "./process-sync-queue.js";

let inFlight: Promise<ProcessSyncResult> | null = null;

/**
 * Не более одного параллельного прогона очереди: кнопка «Синхронизировать», `online`, возврат на вкладку.
 * Повторный вызов до завершения возвращает тот же `Promise`.
 */
export function processSyncQueueSerialized(options: ProcessSyncOptions = {}): Promise<ProcessSyncResult> {
  if (!inFlight) {
    inFlight = processSyncQueue(options).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
