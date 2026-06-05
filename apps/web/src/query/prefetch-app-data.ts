import type { QueryClient } from "@tanstack/react-query";

import {
  adminDashboardSummaryQueryOptions,
  productGradesFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "./core-list-queries.js";
import { QUERY_STALE_LISTS_MS } from "./query-defaults.js";

function fireAndForget(p: Promise<unknown>): void {
  void p.catch(() => {
    /* префетч — фон */
  });
}

export type PrefetchCoreListsOptions = {
  prefetchPurchaseDocuments?: boolean;
  prefetchCounterparties?: boolean;
  prefetchWholesalers?: boolean;
};

/** Прогревает лёгкие справочники и сводку; тяжёлые списки — по экранам с пагинацией. */
export function prefetchCoreLists(queryClient: QueryClient, _opts?: PrefetchCoreListsOptions): void {
  const stale = QUERY_STALE_LISTS_MS;

  fireAndForget(queryClient.prefetchQuery({ ...adminDashboardSummaryQueryOptions(), staleTime: stale }));
  fireAndForget(queryClient.prefetchQuery({ ...warehousesFullListQueryOptions(), staleTime: stale }));
  fireAndForget(queryClient.prefetchQuery({ ...productGradesFullListQueryOptions(), staleTime: stale }));
}
