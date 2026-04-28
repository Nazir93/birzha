/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Background Sync API (Chrome): дополнение к `ServiceWorkerRegistration`. */
interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly sync?: SyncManager;
}
