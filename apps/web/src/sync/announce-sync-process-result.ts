import type { QueryClient } from "@tanstack/react-query";

import { queryRoots } from "../query/core-list-queries.js";
import type { ProcessSyncResult } from "./process-sync-queue.js";
import { dispatchSyncProcessResult } from "./sync-result-events.js";

/** Уведомление UI + сброс кэша списков после попытки синхронизации очереди. */
export function announceSyncProcessResult(queryClient: QueryClient, result: ProcessSyncResult): void {
  dispatchSyncProcessResult(result);
  void queryClient.invalidateQueries({ queryKey: ["outbox"] });
  if (result.processed > 0) {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
  }
}
