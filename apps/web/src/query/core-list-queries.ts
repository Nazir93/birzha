import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { apiFetch, apiGetJson } from "../api/fetch-api.js";
import type {
  AdminDashboardSummaryResponse,
  BatchesListResponse,
  CounterpartiesListResponse,
  FieldSellerOptionsResponse,
  ProductGradesListResponse,
  PurchaseDocumentDetail,
  PurchaseDocumentsListResponse,
  LoadingManifestDetailResponse,
  LoadingManifestReservedBatchIdsResponse,
  LoadingManifestsListResponse,
  ShipmentReportResponse,
  ShipDestinationsListResponse,
  StockBalancesResponse,
  TripSaleLinesResponse,
  TripsListResponse,
  WarehouseWriteOffsRecentResponse,
  WarehousesListResponse,
  WholesalersListResponse,
} from "../api/types.js";
import {
  QUERY_STALE_LISTS_MS,
  QUERY_STALE_SHIPMENT_REPORT_MS,
} from "./query-defaults.js";

/**
 * Корни `queryKey` для списков и для `invalidateQueries` (префиксный матч).
 */
export const queryRoots = {
  trips: ["trips"] as const,
  batches: ["batches"] as const,
  warehouses: ["warehouses"] as const,
  productGrades: ["product-grades"] as const,
  purchaseDocuments: ["purchase-documents"] as const,
  counterparties: ["counterparties"] as const,
  wholesalers: ["wholesalers"] as const,
  shipDestinations: ["ship-destinations"] as const,
  loadingManifest: ["loading-manifest"] as const,
  adminDashboard: ["admin-dashboard-summary"] as const,
  stockBalances: ["stock-balances"] as const,
  warehouseWriteOffsLedger: ["warehouse-write-offs-ledger"] as const,
  shipmentReport: ["shipment-report"] as const,
  tripSaleLines: ["trip-sale-lines"] as const,
} as const;

export type TripListStatus = "open" | "closed";
export type TripListOrder = "tripNumber" | "departedAtDesc";
export type LoadingManifestListScope = "active" | "archived" | "all";
export type PurchaseDocumentListScope = "inWork" | "archived" | "all";

/** @deprecated Используйте `tripsPickerQueryOptions` с нужным `status`. */
export const tripsFullListQueryOptions = () =>
  tripsPickerQueryOptions({ limit: 500, status: "open" });

/** Подборщик рейсов: `GET /api/trips?limit=&offset=&search=&status=&order=`. */
export const tripsPickerQueryOptions = (
  opts: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: TripListStatus;
    order?: TripListOrder;
    assignedSellerUserId?: string;
  } = {},
) => {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? "";
  const status = opts.status ?? "";
  const order = opts.order ?? "departedAtDesc";
  const assignedSellerUserId = opts.assignedSellerUserId?.trim() ?? "";
  return queryOptions({
    queryKey: [
      ...queryRoots.trips,
      "picker",
      limit,
      offset,
      search,
      status,
      order,
      assignedSellerUserId,
    ] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(limit));
      p.set("offset", String(offset));
      if (search) {
        p.set("search", search);
      }
      if (status) {
        p.set("status", status);
      }
      if (order === "tripNumber") {
        p.set("order", "tripNumber");
      }
      if (assignedSellerUserId) {
        p.set("assignedSellerUserId", assignedSellerUserId);
      }
      return apiGetJson<TripsListResponse>(`/api/trips?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });
};

export const tripsFieldSellerOptionsQueryOptions = () =>
  queryOptions({
    queryKey: [...queryRoots.trips, "field-seller-options"] as const,
    queryFn: () => apiGetJson<FieldSellerOptionsResponse>("/api/trips/field-seller-options"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

/** @deprecated Используйте `batchesStockOnlyQueryOptions`, `batchesForWarehouseQueryOptions` или `batchesByIdsQueryOptions`. */
export const batchesFullListQueryOptions = () => batchesStockOnlyQueryOptions(500);

export const batchesByIdsQueryOptions = (ids: readonly string[]) => {
  const sorted = [...ids].sort();
  const keyPart = sorted.join("|");
  return queryOptions({
    queryKey: [...queryRoots.batches, "by-ids", keyPart] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("ids", sorted.join(","));
      return apiGetJson<BatchesListResponse>(`/api/batches?${p}`);
    },
    enabled: sorted.length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
    refetchOnWindowFocus: true,
  });
};

export const batchesSearchQueryOptions = (search: string, limit = 20) => {
  const q = search.trim();
  return queryOptions({
    queryKey: [...queryRoots.batches, "search", q, limit] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("search", q);
      p.set("limit", String(limit));
      return apiGetJson<BatchesListResponse>(`/api/batches?${p}`);
    },
    enabled: q.length >= 2,
    staleTime: QUERY_STALE_LISTS_MS,
  });
};

/** Партии с остатком на складе — для «Операций» и отгрузки. */
export const batchesStockOnlyQueryOptions = (limit = 500, offset = 0) =>
  queryOptions({
    queryKey: [...queryRoots.batches, "stock-only", limit, offset] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("stockOnly", "1");
      p.set("limit", String(limit));
      p.set("offset", String(offset));
      return apiGetJson<BatchesListResponse>(`/api/batches?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });

export const batchesForWarehouseQueryOptions = (warehouseId: string, limit = 500) => {
  const wh = warehouseId.trim();
  return queryOptions({
    queryKey: [...queryRoots.batches, "warehouse", wh, limit] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("warehouseId", wh);
      p.set("stockOnly", "1");
      p.set("limit", String(limit));
      p.set("offset", "0");
      return apiGetJson<BatchesListResponse>(`/api/batches?${p}`);
    },
    enabled: wh.length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });
};

export const warehousesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.warehouses,
    queryFn: () => apiGetJson<WarehousesListResponse>("/api/warehouses"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const productGradesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.productGrades,
    queryFn: () => apiGetJson<ProductGradesListResponse>("/api/product-grades"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

/** @deprecated Используйте `purchaseDocumentsPagedQueryOptions`. */
export const purchaseDocumentsFullListQueryOptions = () =>
  purchaseDocumentsPagedQueryOptions({ limit: 500, offset: 0, scope: "inWork" });

export const purchaseDocumentsPagedQueryOptions = (opts: {
  limit: number;
  offset: number;
  scope?: PurchaseDocumentListScope;
  search?: string;
}) =>
  queryOptions({
    queryKey: [
      ...queryRoots.purchaseDocuments,
      "paged",
      opts.scope ?? "all",
      opts.limit,
      opts.offset,
      opts.search?.trim() ?? "",
    ] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(opts.limit));
      p.set("offset", String(opts.offset));
      if (opts.scope) {
        p.set("scope", opts.scope);
      }
      const q = opts.search?.trim();
      if (q) {
        p.set("search", q);
      }
      return apiGetJson<PurchaseDocumentsListResponse>(`/api/purchase-documents?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });

export const adminDashboardSummaryQueryOptions = (since?: string) =>
  queryOptions({
    queryKey: [...queryRoots.adminDashboard, since ?? "all"] as const,
    queryFn: () => {
      const p = since?.trim() ? `?since=${encodeURIComponent(since.trim())}` : "";
      return apiGetJson<AdminDashboardSummaryResponse>(`/api/admin/dashboard-summary${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const stockBalancesQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.stockBalances,
    queryFn: () => apiGetJson<StockBalancesResponse>("/api/stock-balances"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const counterpartiesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.counterparties,
    queryFn: () => apiGetJson<CounterpartiesListResponse>("/api/counterparties"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const wholesalersFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.wholesalers,
    queryFn: () => apiGetJson<WholesalersListResponse>("/api/wholesalers"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const shipDestinationsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.shipDestinations,
    queryFn: () => apiGetJson<ShipDestinationsListResponse>("/api/ship-destinations"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const loadingManifestDetailQueryOptions = (manifestId: string) =>
  queryOptions({
    queryKey: [...queryRoots.loadingManifest, manifestId] as const,
    queryFn: () => apiGetJson<LoadingManifestDetailResponse>(`/api/loading-manifests/${encodeURIComponent(manifestId)}`),
    enabled: manifestId.trim().length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const loadingManifestsPagedQueryOptions = (opts: {
  limit: number;
  offset: number;
  scope?: LoadingManifestListScope;
  search?: string;
  tripId?: string;
}) =>
  queryOptions({
    queryKey: [
      ...queryRoots.loadingManifest,
      "list",
      "paged",
      opts.scope ?? "all",
      opts.limit,
      opts.offset,
      opts.search?.trim() ?? "",
      opts.tripId?.trim() ?? "",
    ] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(opts.limit));
      p.set("offset", String(opts.offset));
      if (opts.scope) {
        p.set("scope", opts.scope);
      }
      const q = opts.search?.trim();
      if (q) {
        p.set("search", q);
      }
      const tripId = opts.tripId?.trim();
      if (tripId) {
        p.set("tripId", tripId);
      }
      return apiGetJson<LoadingManifestsListResponse>(`/api/loading-manifests?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });

export const loadingManifestReservedBatchIdsQueryOptions = (warehouseId: string) =>
  queryOptions({
    queryKey: [...queryRoots.loadingManifest, "reserved-batch-ids", warehouseId] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("warehouseId", warehouseId.trim());
      return apiGetJson<LoadingManifestReservedBatchIdsResponse>(`/api/loading-manifests/reserved-batch-ids?${p}`);
    },
    enabled: warehouseId.trim().length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
  });

export const warehouseWriteOffsLedgerQueryOptions = (opts: {
  warehouseId?: string;
  limit?: number;
  offset?: number;
}) =>
  queryOptions({
    queryKey: [
      ...queryRoots.warehouseWriteOffsLedger,
      opts.warehouseId ?? "",
      opts.limit ?? 300,
      opts.offset ?? 0,
    ] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(opts.limit ?? 300));
      p.set("offset", String(opts.offset ?? 0));
      if (opts.warehouseId && opts.warehouseId.trim().length > 0) {
        p.set("warehouseId", opts.warehouseId.trim());
      }
      return apiGetJson<WarehouseWriteOffsRecentResponse>(`/api/warehouse-write-offs?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
  });

/** После мутаций остатков: партии, сводка складов, резерв в погрузке. */
export function invalidateStockQueries(queryClient: { invalidateQueries: (opts: { queryKey: readonly unknown[] }) => void }): void {
  queryClient.invalidateQueries({ queryKey: queryRoots.batches });
  queryClient.invalidateQueries({ queryKey: queryRoots.stockBalances });
  queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "reserved-batch-ids"] });
}

export const shipmentReportQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: [...queryRoots.shipmentReport, tripId] as const,
    queryFn: () =>
      apiGetJson<ShipmentReportResponse>(
        `/api/trips/${encodeURIComponent(tripId)}/shipment-report`,
      ),
    staleTime: QUERY_STALE_SHIPMENT_REPORT_MS,
    refetchOnWindowFocus: true,
  });

export const tripSaleLinesQueryOptions = (tripId: string) =>
  queryOptions({
    queryKey: [...queryRoots.tripSaleLines, tripId] as const,
    queryFn: () =>
      apiGetJson<TripSaleLinesResponse>(
        `/api/trips/${encodeURIComponent(tripId)}/sale-lines`,
      ),
    staleTime: QUERY_STALE_SHIPMENT_REPORT_MS,
    enabled: tripId.trim().length > 0,
  });

export const purchaseDocumentDetailQueryOptions = (documentId: string) =>
  queryOptions({
    queryKey: ["purchase-document", documentId] as const,
    queryFn: async (): Promise<PurchaseDocumentDetail | null> => {
      const res = await apiFetch(`/api/purchase-documents/${encodeURIComponent(documentId)}`);
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error(`purchase-documents/${documentId} ${res.status}`);
      }
      return res.json() as Promise<PurchaseDocumentDetail>;
    },
    staleTime: QUERY_STALE_LISTS_MS,
  });
