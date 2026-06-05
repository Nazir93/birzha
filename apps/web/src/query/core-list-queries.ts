import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { apiFetch, apiGetJson } from "../api/fetch-api.js";
import type {
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
 * Синхронизированы с фабриками `*QueryOptions` ниже.
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
  /** Журнал списаний с остатка (брак) — `GET /warehouse-write-offs` без purchaseDocumentId. */
  warehouseWriteOffsLedger: ["warehouse-write-offs-ledger"] as const,
  /** Префикс всех `GET …/shipment-report` по рейсам */
  shipmentReport: ["shipment-report"] as const,
  tripSaleLines: ["trip-sale-lines"] as const,
} as const;

/**
 * Полный `GET /api/trips` без параметров подборщика — один queryKey для кеша по всему приложению.
 */
export const tripsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.trips,
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    staleTime: QUERY_STALE_LISTS_MS,
    refetchOnWindowFocus: true,
    /** Меньше «мигания» таблиц при invalidate после мутаций (Operations, отчёт, распределение). */
    placeholderData: keepPreviousData,
  });

/** Подборщик рейсов: `GET /api/trips?limit=&offset=` — без тяжёлой сводки у закрытых. */
export const tripsPickerQueryOptions = (opts: { limit?: number; offset?: number; search?: string } = {}) => {
  const limit = opts.limit ?? 500;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim() ?? "";
  return queryOptions({
    queryKey: [...queryRoots.trips, "picker", limit, offset, search] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(limit));
      p.set("offset", String(offset));
      if (search) {
        p.set("search", search);
      }
      return apiGetJson<TripsListResponse>(`/api/trips?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });
};

/** Список полевых продавцов для назначения на рейс: `GET /api/trips/field-seller-options`. */
export const tripsFieldSellerOptionsQueryOptions = () =>
  queryOptions({
    queryKey: [...queryRoots.trips, "field-seller-options"] as const,
    queryFn: () => apiGetJson<FieldSellerOptionsResponse>("/api/trips/field-seller-options"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

/**
 * Полный `GET /api/batches` без фильтров — один queryKey для кеша по всему приложению.
 */
export const batchesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.batches,
    queryFn: () => apiGetJson<BatchesListResponse>("/api/batches"),
    staleTime: QUERY_STALE_LISTS_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

/** Выборка партий по id: `GET /api/batches?ids=`. */
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

/** Поиск партий для подсказки: `GET /api/batches?search=&limit=`. */
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

/** Партии склада с остатком — для «Распределения» без полной выборки. */
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

export const purchaseDocumentsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.purchaseDocuments,
    queryFn: () => apiGetJson<PurchaseDocumentsListResponse>("/api/purchase-documents"),
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

export const loadingManifestsListQueryOptions = () =>
  queryOptions({
    queryKey: [...queryRoots.loadingManifest, "list"] as const,
    queryFn: () => apiGetJson<LoadingManifestsListResponse>("/api/loading-manifests"),
    staleTime: QUERY_STALE_LISTS_MS,
  });

export type LoadingManifestListScope = "active" | "archived" | "all";

/** Пагинированный список погрузочных: `GET /api/loading-manifests?limit=&offset=&scope=`. */
export const loadingManifestsPagedQueryOptions = (opts: {
  limit: number;
  offset: number;
  scope?: LoadingManifestListScope;
  search?: string;
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
      return apiGetJson<LoadingManifestsListResponse>(`/api/loading-manifests?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
    placeholderData: keepPreviousData,
  });

/** Партии, уже внесённые в погрузочные накладные на складе (не показывать в отборе распределения). */
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

/** Журнал списаний брака с остатка: `GET /warehouse-write-offs?limit=&warehouseId=`. */
export const warehouseWriteOffsLedgerQueryOptions = (opts: { warehouseId?: string; limit?: number }) =>
  queryOptions({
    queryKey: [...queryRoots.warehouseWriteOffsLedger, opts.warehouseId ?? "", opts.limit ?? 300] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", String(opts.limit ?? 300));
      if (opts.warehouseId && opts.warehouseId.trim().length > 0) {
        p.set("warehouseId", opts.warehouseId.trim());
      }
      return apiGetJson<WarehouseWriteOffsRecentResponse>(`/api/warehouse-write-offs?${p}`);
    },
    staleTime: QUERY_STALE_LISTS_MS,
  });

/** `GET /api/trips/:id/shipment-report` — один queryKey на рейс для кеша во всех экранах. */
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

/** Строки продаж по рейсу (чтение — архив и отчёт; правки — пока рейс открыт). */
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

/**
 * Деталь накладной: при 404 возвращает `null` (как раньше в экране карточки).
 */
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
