import type { ProcessSyncResult } from "./process-sync-queue.js";

export const BIRZHA_SYNC_RESULT_EVENT = "birzha-sync-result";

export function dispatchSyncProcessResult(result: ProcessSyncResult): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(BIRZHA_SYNC_RESULT_EVENT, { detail: result }));
}
