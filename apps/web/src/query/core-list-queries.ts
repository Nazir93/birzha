import { queryOptions } from "@tanstack/react-query";

import { apiFetch, apiGetJson } from "../api/fetch-api.js";
import type {
  BatchesListResponse,
  CounterpartiesListResponse,
  FieldSellerOptionsResponse,
  ProductGradesListResponse,
  PurchaseDocumentDetail,
  PurchaseDocumentsListResponse,
  LoadingManifestDetailResponse,
  LoadingManifestsListResponse,
  ShipmentReportResponse,
  ShipDestinationsListResponse,
  TripJson,
  TripsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import {
  QUERY_STALE_LISTS_MS,
  QUERY_STALE_SHIPMENT_REPORT_MS,
  QUERY_STALE_TRIP_PICKER_MS,
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
  shipDestinations: ["ship-destinations"] as const,
  loadingManifest: ["loading-manifest"] as const,
  /** Префикс всех `GET …/shipment-report` по рейсам */
  shipmentReport: ["shipment-report"] as const,
} as const;

/**
 * Полный `GET /api/trips` без параметров подборщика — один queryKey для кеша по всему приложению.
 */
export const tripsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.trips,
    queryFn: () => apiGetJson<TripsListResponse>("/api/trips"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

/** Список полевых продавцов для назначения на рейс: `GET /api/trips/field-seller-options`. */
export const tripsFieldSellerOptionsQueryOptions = () =>
  queryOptions({
    queryKey: [...queryRoots.trips, "field-seller-options"] as const,
    queryFn: () => apiGetJson<FieldSellerOptionsResponse>("/api/trips/field-seller-options"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

/**
 * Подбор рейса: `GET /api/trips?search=&limit=&order=` (как в TripSearchPicker).
 */
export const tripsSearchPickerQueryOptions = (search: string) => {
  const q = search.trim();
  return queryOptions({
    queryKey: [...queryRoots.trips, "picker", q] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) {
        p.set("search", q);
      }
      p.set("limit", "80");
      p.set("order", "departedAtDesc");
      return apiGetJson<TripsListResponse>(`/api/trips?${p}`);
    },
    staleTime: QUERY_STALE_TRIP_PICKER_MS,
    retry: 1,
  });
};

/** Одна карточка рейса: `GET /api/trips/:id`. */
export const tripByIdQueryOptions = (tripId: string) => {
  const id = tripId.trim();
  return queryOptions({
    queryKey: [...queryRoots.trips, "detail", id] as const,
    queryFn: () => apiGetJson<{ trip: TripJson }>(`/api/trips/${encodeURIComponent(id)}`),
    enabled: id.length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });
};

/**
 * Полный `GET /api/batches` без фильтров — один queryKey для кеша по всему приложению.
 */
export const batchesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.batches,
    queryFn: () => apiGetJson<BatchesListResponse>("/api/batches"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
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
    retry: 1,
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
    retry: 1,
  });
};

export const warehousesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.warehouses,
    queryFn: () => apiGetJson<WarehousesListResponse>("/api/warehouses"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const productGradesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.productGrades,
    queryFn: () => apiGetJson<ProductGradesListResponse>("/api/product-grades"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const purchaseDocumentsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.purchaseDocuments,
    queryFn: () => apiGetJson<PurchaseDocumentsListResponse>("/api/purchase-documents"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const counterpartiesFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.counterparties,
    queryFn: () => apiGetJson<CounterpartiesListResponse>("/api/counterparties"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const shipDestinationsFullListQueryOptions = () =>
  queryOptions({
    queryKey: queryRoots.shipDestinations,
    queryFn: () => apiGetJson<ShipDestinationsListResponse>("/api/ship-destinations"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const loadingManifestDetailQueryOptions = (manifestId: string) =>
  queryOptions({
    queryKey: [...queryRoots.loadingManifest, manifestId] as const,
    queryFn: () => apiGetJson<LoadingManifestDetailResponse>(`/api/loading-manifests/${encodeURIComponent(manifestId)}`),
    enabled: manifestId.trim().length > 0,
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
  });

export const loadingManifestsListQueryOptions = () =>
  queryOptions({
    queryKey: [...queryRoots.loadingManifest, "list"] as const,
    queryFn: () => apiGetJson<LoadingManifestsListResponse>("/api/loading-manifests"),
    staleTime: QUERY_STALE_LISTS_MS,
    retry: 1,
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
    retry: 1,
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
    retry: 1,
  });
