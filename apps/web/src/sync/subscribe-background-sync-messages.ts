import { BG_SYNC_RUN_OUTBOX_MESSAGE } from "./background-sync-shared.js";
import { processSyncQueueSerialized, type ProcessSyncResult } from "./process-sync-queue-serial.js";

export type SubscribeBackgroundSyncMessagesOptions = {
  onResult?: (result: ProcessSyncResult) => void;
};

/**
 * Слушает сообщения от SW (Background Sync) и прогоняет очередь синхронизации.
 */
export function subscribeBackgroundSyncMessages(
  options: SubscribeBackgroundSyncMessagesOptions = {},
): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }

  const handler = (ev: MessageEvent) => {
    if (ev.data?.type === BG_SYNC_RUN_OUTBOX_MESSAGE) {
      void processSyncQueueSerialized().then((r) => options.onResult?.(r));
    }
  };

  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
