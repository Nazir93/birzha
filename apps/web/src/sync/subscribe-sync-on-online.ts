import type { ProcessSyncResult } from "./process-sync-queue.js";
import { processSyncQueueSerialized } from "./process-sync-queue-serial.js";

export type SubscribeSyncOnOnlineOptions = {
  onResult?: (result: ProcessSyncResult) => void;
  /**
   * Пока вкладка видима и есть сеть — дополнительные попытки синка не чаще чем раз в N мс
   * (на случай «залипшего» online без события или тихих сетевых сбоев). `0` или не задано — без таймера.
   */
  periodicIntervalMs?: number;
};

/**
 * При появлении сети и при возврате на вкладку (если перед этим была скрыта) — попытка `processSyncQueueSerialized`.
 * Опционально: периодическая попытка при открытой вкладке (`periodicIntervalMs`).
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

  const runIfVisibleAndOnline = () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    run();
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

  const intervalMs = options.periodicIntervalMs ?? 0;
  const intervalId =
    intervalMs > 0 ? window.setInterval(runIfVisibleAndOnline, intervalMs) : undefined;

  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", onVisibility);
    if (intervalId !== undefined) {
      window.clearInterval(intervalId);
    }
  };
}
