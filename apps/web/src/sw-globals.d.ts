/**
 * Типы для `src/sw.ts` при `tsc -p tsconfig.sw.json` (без DOM: только WebWorker).
 * В TS глобальный `self` в воркере — `WorkerGlobalScope`; расширяем до контекста service worker.
 */
/// <reference lib="webworker" />

interface WorkerGlobalScope {
  __WB_MANIFEST: Array<{ url: string; revision: string | null } | string>;
  skipWaiting(): Promise<void>;
  readonly clients: Clients;
}

interface WorkerGlobalScopeEventMap {
  sync: SyncEvent;
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}
