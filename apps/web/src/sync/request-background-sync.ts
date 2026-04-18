import { OUTBOX_BACKGROUND_SYNC_TAG } from "./background-sync-shared.js";

/**
 * Регистрирует Background Sync (Chrome и др.), если доступен.
 * При срабатывании SW шлёт сообщение клиенту — см. `subscribeBackgroundSyncMessages`.
 */
export async function requestOutboxBackgroundSync(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = reg.sync;
    if (sync && typeof sync.register === "function") {
      await sync.register(OUTBOX_BACKGROUND_SYNC_TAG);
      return true;
    }
  } catch {
    /* нет прав / не поддерживается */
  }
  return false;
}
