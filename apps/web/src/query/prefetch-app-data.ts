import type { QueryClient } from "@tanstack/react-query";

import {
  batchesFullListQueryOptions,
  counterpartiesFullListQueryOptions,
  productGradesFullListQueryOptions,
  purchaseDocumentsFullListQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "./core-list-queries.js";
import { QUERY_STALE_LISTS_MS } from "./query-defaults.js";

function fireAndForget(p: Promise<unknown>): void {
  void p.catch(() => {
    /* префетч — фон: при неполном API не засоряем консоль как ошибка UX */
  });
}

export type PrefetchCoreListsOptions = {
  prefetchPurchaseDocuments?: boolean;
  prefetchCounterparties?: boolean;
};

/**
 * Прогревает кеш частых GET до перехода в кабинеты: меньше «пустого» экрана при первом открытии /a, /s, /b.
 */
export function prefetchCoreLists(queryClient: QueryClient, opts?: PrefetchCoreListsOptions): void {
  const stale = QUERY_STALE_LISTS_MS;

  fireAndForget(queryClient.prefetchQuery({ ...tripsFullListQueryOptions(), staleTime: stale }));
  fireAndForget(queryClient.prefetchQuery({ ...batchesFullListQueryOptions(), staleTime: stale }));
  fireAndForget(queryClient.prefetchQuery({ ...warehousesFullListQueryOptions(), staleTime: stale }));
  fireAndForget(queryClient.prefetchQuery({ ...productGradesFullListQueryOptions(), staleTime: stale }));

  if (opts?.prefetchPurchaseDocuments) {
    fireAndForget(
      queryClient.prefetchQuery({ ...purchaseDocumentsFullListQueryOptions(), staleTime: stale }),
    );
  }
  if (opts?.prefetchCounterparties) {
    fireAndForget(
      queryClient.prefetchQuery({ ...counterpartiesFullListQueryOptions(), staleTime: stale }),
    );
  }
}
