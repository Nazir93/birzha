import type { QueryClient } from "@tanstack/react-query";

import { invalidateStockQueries, queryRoots } from "./core-list-queries.js";

/**
 * После закупочной накладной партии и остатки «на складе» меняются сразу — нужен свежий `GET /api/batches`,
 * иначе сводка админа может показывать устаревший срез из localStorage (invalidate без refetch не всегда успевает).
 */
export async function refreshPurchaseAndBatchLists(queryClient: QueryClient): Promise<void> {
  invalidateStockQueries(queryClient);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: queryRoots.batches }),
    queryClient.refetchQueries({ queryKey: queryRoots.purchaseDocuments }),
  ]);
}

/** Свежие списки для «Погрузка на машину»: партии, ПН (список и карточки), резерв, рейсы. */
export async function refreshDistributionLists(queryClient: QueryClient): Promise<void> {
  invalidateStockQueries(queryClient);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: queryRoots.batches }),
    queryClient.refetchQueries({ queryKey: queryRoots.loadingManifest }),
    queryClient.refetchQueries({ queryKey: queryRoots.trips }),
  ]);
}

/** После удаления из архива — рейсы, закупочные и погрузочные накладные. */
export async function refreshArchiveLists(queryClient: QueryClient): Promise<void> {
  invalidateStockQueries(queryClient);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: queryRoots.trips }),
    queryClient.refetchQueries({ queryKey: queryRoots.purchaseDocuments }),
    queryClient.refetchQueries({ queryKey: queryRoots.loadingManifest }),
  ]);
}
