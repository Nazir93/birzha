import type { ProcessSyncResult } from "./process-sync-queue.js";
import { processSyncQueueSerialized } from "./process-sync-queue-serial.js";

export type SubscribeSyncOnOnlineOptions = {
  onResult?: (result: ProcessSyncResult) => void;
};

/**
 * При появлении сети и при возврате на вкладку (если перед этим была скрыта) — попытка `processSyncQueueSerialized`.
 * В SSR/тестах без `window` — no-op, возвращает пустую отписку.
 */
export function subscribeSyncOnOnline(options: SubscribeSyncOnOnlineOptions = {}): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  const run = () => {
    if (!navigator.onLine) {
      return;
    }
    void processSyncQueueSerialized().then((r) => {
      options.onResult?.(r);
    });
  };

  window.addEventListener("online", run);

  let wasHidden = document.visibilityState === "hidden";
  const onVisibility = () => {
    if (document.visibilityState === "visible" && wasHidden) {
      wasHidden = false;
      run();
    } else if (document.visibilityState === "hidden") {
      wasHidden = true;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  queueMicrotask(run);

  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
