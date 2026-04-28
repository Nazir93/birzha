import type { QueryClient } from "@tanstack/react-query";

import { apiGetJson } from "../api/fetch-api.js";
import type {
  BatchesListResponse,
  CounterpartiesListResponse,
  ProductGradesListResponse,
  PurchaseDocumentsListResponse,
  TripsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
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

  fireAndForget(
    queryClient.prefetchQuery({
      queryKey: ["trips"],
      queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
      staleTime: stale,
    }),
  );
  fireAndForget(
    queryClient.prefetchQuery({
      queryKey: ["batches"],
      queryFn: () => apiGetJson<BatchesListResponse>("/api/batches"),
      staleTime: stale,
    }),
  );
  fireAndForget(
    queryClient.prefetchQuery({
      queryKey: ["warehouses"],
      queryFn: () => apiGetJson<WarehousesListResponse>("/api/warehouses"),
      staleTime: stale,
    }),
  );

  fireAndForget(
    queryClient.prefetchQuery({
      queryKey: ["product-grades"],
      queryFn: () => apiGetJson<ProductGradesListResponse>("/api/product-grades"),
      staleTime: stale,
    }),
  );

  if (opts?.prefetchPurchaseDocuments) {
    fireAndForget(
      queryClient.prefetchQuery({
        queryKey: ["purchase-documents"],
        queryFn: () => apiGetJson<PurchaseDocumentsListResponse>("/api/purchase-documents"),
        staleTime: stale,
      }),
    );
  }
  if (opts?.prefetchCounterparties) {
    fireAndForget(
      queryClient.prefetchQuery({
        queryKey: ["counterparties"],
        queryFn: () => apiGetJson<CounterpartiesListResponse>("/api/counterparties"),
        staleTime: stale,
      }),
    );
  }
}
