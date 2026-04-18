import { resetDefaultOutboxBackendCache } from "./outbox-backend.js";
import { resetOutboxIdbConnection } from "./outbox-idb.js";

/** После смены области очереди (другой пользователь / выход). Синхронно. */
export function invalidateOfflineStorageForScopeChange(): void {
  resetOutboxIdbConnection();
  resetDefaultOutboxBackendCache();
}
