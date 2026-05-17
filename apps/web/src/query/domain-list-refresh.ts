import type { QueryClient } from "@tanstack/react-query";

import { queryRoots } from "./core-list-queries.js";

/**
 * После закупочной накладной партии и остатки «на складе» меняются сразу — нужен свежий `GET /api/batches`,
 * иначе сводка админа может показывать устаревший срез из localStorage (invalidate без refetch не всегда успевает).
 */
export async function refreshPurchaseAndBatchLists(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: queryRoots.batches }),
    queryClient.refetchQueries({ queryKey: queryRoots.purchaseDocuments }),
  ]);
}
