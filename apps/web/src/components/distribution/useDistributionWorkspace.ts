import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { BATCH_DESTINATIONS } from "@birzha/contracts";
import type { BatchListItem, LoadingManifestSummary } from "../../api/types.js";
import { useAuth } from "../../auth/auth-context.js";
import { closedTripIdSet, filterTripsInWork } from "../../format/archive.js";
import { documentOptionsForAllocation } from "../../format/allocation-document-options.js";
import { batchWarehouseId, isEligibleForLoadingAllocation } from "../../format/batch-warehouse.js";
import {
  estimatedPackageCountOnShelf,
  filterBatchesForLoadingManifest,
} from "../../format/loading-manifest.js";
import { sortLoadingManifestsByCreatedAtDesc } from "../../format/loading-manifest-list.js";
import {
  listTripLinkedWarehouseIdsFromManifests,
  tripSellerBlocksCrossWarehouseLoading,
} from "../../format/trip-seller-loading-guard.js";
import { humanizeErrorMessage } from "../../format/user-facing-error.js";
import {
  batchesForWarehouseQueryOptions,
  loadingManifestDetailQueryOptions,
  loadingManifestReservedBatchIdsQueryOptions,
  loadingManifestsPagedQueryOptions,
  shipDestinationsFullListQueryOptions,
  tripsPickerQueryOptions,
  warehousesFullListQueryOptions,
} from "../../query/core-list-queries.js";
import { refreshDistributionLists } from "../../query/domain-list-refresh.js";
import { loadingSummaryFromDetail } from "../loading-manifest/loading-summary-from-detail.js";
import type { LoadingManifestDocOption } from "../LoadingManifestBlock.js";

const labelsDestination: Record<(typeof BATCH_DESTINATIONS)[number], string> = {
  moscow: "Москва",
  regions: "Регионы",
  discount: "Уценка / распродажа",
  writeoff: "Списание",
};

export const MANIFEST_LIST_PAGE_SIZE = 50;

function groupBatchesByWarehouse(stock: BatchListItem[]): {
  byWarehouse: Map<string, BatchListItem[]>;
  order: string[];
} {
  const byWarehouse = new Map<string, BatchListItem[]>();
  for (const b of stock) {
    const key = b.nakladnaya!.warehouseId!.trim();
    if (!byWarehouse.has(key)) {
      byWarehouse.set(key, []);
    }
    byWarehouse.get(key)!.push(b);
  }
  const order = [...byWarehouse.keys()].sort((a, c) => a.localeCompare(c, "ru"));
  return { byWarehouse, order };
}

function sumOnWarehouseKg(batches: BatchListItem[]): number {
  return batches.reduce((a, b) => a + b.onWarehouseKg, 0);
}

function sumPackageEstimatesForWarehouse(batches: BatchListItem[]): { sum: number; linesWithBoxData: number } {
  let sum = 0;
  let linesWithBoxData = 0;
  for (const b of batches) {
    const e = estimatedPackageCountOnShelf(b);
    if (e != null) {
      sum += e;
      linesWithBoxData += 1;
    }
  }
  return { sum, linesWithBoxData };
}

export type UseDistributionWorkspaceParams = {
  routeManifestId: string;
  selectedWarehouse: string;
  manifestListPage: number;
  savedManifestId: string;
  newManifestTripId: string;
  appendTargetManifestId: string | null;
  loadNaklSelection: ReadonlySet<string>;
  distributionBase: string;
};

export function useDistributionWorkspace({
  routeManifestId,
  selectedWarehouse,
  manifestListPage,
  savedManifestId,
  newManifestTripId,
  appendTargetManifestId,
  loadNaklSelection,
  distributionBase,
}: UseDistributionWorkspaceParams) {
  const { meta } = useAuth();
  const queryClient = useQueryClient();

  const shipDestQ = useQuery({
    ...shipDestinationsFullListQueryOptions(),
    enabled: meta?.shipDestinationsApi === "enabled",
  });
  const { destAllowed, labelDest } = useMemo((): { destAllowed: readonly string[]; labelDest: Record<string, string> } => {
    const act = (shipDestQ.data?.shipDestinations ?? []).filter((r) => r.isActive);
    if (act.length > 0) {
      const sorted = act.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru"));
      const m: Record<string, string> = {};
      for (const r of sorted) {
        m[r.code] = r.displayName;
      }
      return { destAllowed: sorted.map((r) => r.code), labelDest: m };
    }
    const fallback: Record<string, string> = { ...labelsDestination };
    return { destAllowed: [...BATCH_DESTINATIONS], labelDest: fallback };
  }, [shipDestQ.data]);

  const warehousesQuery = useQuery(warehousesFullListQueryOptions());
  const warehouseIds = useMemo(
    () => (warehousesQuery.data?.warehouses ?? []).map((w) => w.id),
    [warehousesQuery.data?.warehouses],
  );
  const warehouseBatchQueries = useQueries({
    queries: warehouseIds.map((id) => batchesForWarehouseQueryOptions(id, 500)),
  });
  const batchesMerged = useMemo(
    () => warehouseBatchQueries.flatMap((q) => q.data?.batches ?? []),
    [warehouseBatchQueries],
  );
  const batchesQueryPending = warehousesQuery.isPending || warehouseBatchQueries.some((q) => q.isPending);
  const batchesQueryError = warehousesQuery.isError || warehouseBatchQueries.some((q) => q.isError);
  const batchesQueryErrorMessage = useMemo(() => {
    if (warehousesQuery.isError) {
      return humanizeErrorMessage(warehousesQuery.error);
    }
    const failed = warehouseBatchQueries.find((q) => q.isError);
    return failed ? humanizeErrorMessage(failed.error) : null;
  }, [warehousesQuery.isError, warehousesQuery.error, warehouseBatchQueries]);
  const batchesQueryFetching = warehouseBatchQueries.some((q) => q.isFetching);

  useEffect(() => {
    void refreshDistributionLists(queryClient);
  }, [queryClient, distributionBase]);

  const tripsQuery = useQuery(tripsPickerQueryOptions({ limit: 500, offset: 0 }));
  const routeDetailQuery = useQuery({
    ...loadingManifestDetailQueryOptions(routeManifestId),
    enabled: Boolean(routeManifestId.trim()),
  });

  const viewingSaved = Boolean(routeManifestId.trim());
  const activeManifestId = routeManifestId.trim() || savedManifestId;

  const warehouseName = useCallback(
    (id: string) => {
      const w = warehousesQuery.data?.warehouses.find((x) => x.id === id);
      return w?.name?.trim() ? w.name.trim() : "Неизвестный склад";
    },
    [warehousesQuery.data?.warehouses],
  );

  const savedManifestQuery = useQuery({
    ...loadingManifestDetailQueryOptions(savedManifestId),
    enabled: Boolean(savedManifestId) && savedManifestId !== routeManifestId.trim(),
  });

  const manifestsListQuery = useQuery(
    loadingManifestsPagedQueryOptions({
      limit: MANIFEST_LIST_PAGE_SIZE,
      offset: manifestListPage * MANIFEST_LIST_PAGE_SIZE,
      scope: "active",
    }),
  );

  const reservedBatchIdsQuery = useQuery({
    ...loadingManifestReservedBatchIdsQueryOptions(selectedWarehouse),
    enabled: Boolean(selectedWarehouse),
  });

  const reservedBatchIdSet = useMemo(() => {
    if (reservedBatchIdsQuery.isError) {
      return new Set<string>();
    }
    return new Set(reservedBatchIdsQuery.data?.batchIds ?? []);
  }, [reservedBatchIdsQuery.data?.batchIds, reservedBatchIdsQuery.isError]);

  const closedIds = useMemo(() => closedTripIdSet(tripsQuery.data?.trips ?? []), [tripsQuery.data?.trips]);
  const activeManifests = manifestsListQuery.data?.loadingManifests ?? [];
  const manifestListTotal = manifestsListQuery.data?.listMeta?.totalCount ?? activeManifests.length;
  const manifestListPageCount = Math.max(1, Math.ceil(manifestListTotal / MANIFEST_LIST_PAGE_SIZE));
  const distributionManifestListReady = tripsQuery.isSuccess && manifestsListQuery.isSuccess;

  const allActiveManifestsSorted = useMemo(
    () => sortLoadingManifestsByCreatedAtDesc(activeManifests),
    [activeManifests],
  );

  const tripNumberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tripsQuery.data?.trips ?? []) {
      m.set(t.id, t.tripNumber);
    }
    return m;
  }, [tripsQuery.data?.trips]);

  const openTripsForAssign = useMemo(
    () => filterTripsInWork(tripsQuery.data?.trips ?? []),
    [tripsQuery.data?.trips],
  );

  const selectedTripForManifest = useMemo(() => {
    const tripId = newManifestTripId.trim();
    if (!tripId) {
      return null;
    }
    return openTripsForAssign.find((t) => t.id === tripId) ?? null;
  }, [newManifestTripId, openTripsForAssign]);

  const linkedWarehouseIdsForSelectedTrip = useMemo(() => {
    const tripId = newManifestTripId.trim();
    if (!tripId) {
      return [];
    }
    return listTripLinkedWarehouseIdsFromManifests(tripId, activeManifests);
  }, [newManifestTripId, activeManifests]);

  const appendTargetManifest = useMemo(
    () => (appendTargetManifestId ? activeManifests.find((m) => m.id === appendTargetManifestId) ?? null : null),
    [activeManifests, appendTargetManifestId],
  );
  const appendMode = Boolean(appendTargetManifest);

  const routeDetail = routeDetailQuery.data?.manifest;
  const openManifestSummary = useMemo((): LoadingManifestSummary | null => {
    const id = routeManifestId.trim();
    if (!id) {
      return null;
    }
    const fromList = activeManifests.find((x) => x.id === id);
    if (fromList) {
      return fromList;
    }
    if (routeDetail && routeDetail.id === id) {
      return loadingSummaryFromDetail(routeDetail);
    }
    return null;
  }, [routeManifestId, activeManifests, routeDetail]);

  const viewingArchivedManifest = useMemo(() => {
    const id = routeManifestId.trim();
    if (!id || !routeDetail) {
      return false;
    }
    const tid = routeDetail.tripId?.trim();
    return Boolean(tid && closedIds.has(tid));
  }, [routeManifestId, routeDetail, closedIds]);

  const tripForOpenManifest = useMemo(() => {
    const tripId = openManifestSummary?.tripId?.trim();
    if (!tripId) {
      return null;
    }
    return (tripsQuery.data?.trips ?? []).find((t) => t.id === tripId) ?? null;
  }, [openManifestSummary?.tripId, tripsQuery.data?.trips]);

  const crossWarehouseBlocked = useMemo(() => {
    if (!selectedWarehouse.trim()) {
      return false;
    }
    const tripId = appendMode
      ? (appendTargetManifest?.tripId?.trim() ?? newManifestTripId.trim())
      : newManifestTripId.trim();
    const trip =
      (tripId ? (tripsQuery.data?.trips ?? []).find((t) => t.id === tripId) : null) ?? selectedTripForManifest;
    const linked = tripId
      ? listTripLinkedWarehouseIdsFromManifests(tripId, activeManifests)
      : linkedWarehouseIdsForSelectedTrip;
    return tripSellerBlocksCrossWarehouseLoading({
      trip,
      warehouseId: selectedWarehouse,
      linkedWarehouseIds: linked,
    });
  }, [
    appendMode,
    appendTargetManifest?.tripId,
    selectedWarehouse,
    selectedTripForManifest,
    linkedWarehouseIdsForSelectedTrip,
    newManifestTripId,
    tripsQuery.data?.trips,
    activeManifests,
  ]);

  const batchesOnWarehouse = useMemo(
    () => batchesMerged.filter((b) => b.onWarehouseKg > 0),
    [batchesMerged],
  );

  const list = useMemo(
    () =>
      batchesOnWarehouse
        .filter(isEligibleForLoadingAllocation)
        .filter((b) => !reservedBatchIdSet.has(b.id)),
    [batchesOnWarehouse, reservedBatchIdSet],
  );

  const loading = batchesQueryPending;
  const refetching = batchesQueryFetching && !batchesQueryPending;

  const { byWarehouse, order: warehouseOrder } = useMemo(() => groupBatchesByWarehouse(list), [list]);

  const allocationWarehouseOptions = useMemo((): {
    id: string;
    batchCount: number;
    totalKg: number;
    packageEstimate: number;
    linesWithBoxData: number;
  }[] => {
    const out: {
      id: string;
      batchCount: number;
      totalKg: number;
      packageEstimate: number;
      linesWithBoxData: number;
    }[] = [];
    const cat = (warehousesQuery.data?.warehouses ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const add = (id: string) => {
      const bs = byWarehouse.get(id) ?? [];
      const { sum, linesWithBoxData } = sumPackageEstimatesForWarehouse(bs);
      out.push({
        id,
        batchCount: bs.length,
        totalKg: sumOnWarehouseKg(bs),
        packageEstimate: sum,
        linesWithBoxData,
      });
    };
    for (const w of cat) {
      add(w.id);
    }
    for (const id of warehouseOrder) {
      if (cat.some((w) => w.id === id)) {
        continue;
      }
      add(id);
    }
    return out;
  }, [warehousesQuery.data?.warehouses, byWarehouse, warehouseOrder]);

  const showWorkspace =
    !loading && (viewingSaved || list.length > 0 || allocationWarehouseOptions.length > 0);

  const eligibleBatchesOnWarehouse = useMemo(
    () => batchesOnWarehouse.filter(isEligibleForLoadingAllocation),
    [batchesOnWarehouse],
  );

  const batchesOnWarehouseWithoutWarehouse = useMemo(
    () => batchesOnWarehouse.filter((b) => !batchWarehouseId(b)),
    [batchesOnWarehouse],
  );

  const allEligibleStockReserved =
    !viewingSaved &&
    list.length === 0 &&
    eligibleBatchesOnWarehouse.length > 0 &&
    eligibleBatchesOnWarehouse.every((b) => reservedBatchIdSet.has(b.id));

  const selectedWarehouseRow = useMemo(
    () => allocationWarehouseOptions.find((o) => o.id === selectedWarehouse),
    [allocationWarehouseOptions, selectedWarehouse],
  );

  const batchesInWh = useMemo(
    () => (selectedWarehouse ? (byWarehouse.get(selectedWarehouse) ?? []) : []),
    [byWarehouse, selectedWarehouse],
  );

  const documentOptions = useMemo(() => documentOptionsForAllocation(batchesInWh), [batchesInWh]);
  const manifestDocumentOptions: LoadingManifestDocOption[] = useMemo(
    () => documentOptions.map((d) => ({ id: d.id, checkboxLabel: d.checkboxLabel })),
    [documentOptions],
  );

  const tableRows: BatchListItem[] = useMemo(() => {
    if (!selectedWarehouse) {
      return [];
    }
    if (documentOptions.length === 0) {
      return batchesInWh;
    }
    if (loadNaklSelection.size === 0) {
      return filterBatchesForLoadingManifest(batchesInWh, 0, new Set());
    }
    return filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, loadNaklSelection);
  }, [batchesInWh, documentOptions.length, loadNaklSelection, selectedWarehouse]);

  const tableRowsTotalKg = useMemo(
    () => tableRows.reduce((a, b) => a + b.onWarehouseKg, 0),
    [tableRows],
  );

  return {
    destAllowed,
    labelDest,
    warehousesQuery,
    batchesQueryError,
    batchesQueryErrorMessage,
    batchesQueryFetching,
    tripsQuery,
    routeDetailQuery,
    savedManifestQuery,
    manifestsListQuery,
    reservedBatchIdsQuery,
    loading,
    refetching,
    list,
    batchesOnWarehouse,
    eligibleBatchesOnWarehouse,
    batchesOnWarehouseWithoutWarehouse,
    allEligibleStockReserved,
    allocationWarehouseOptions,
    showWorkspace,
    selectedWarehouseRow,
    batchesInWh,
    documentOptions,
    manifestDocumentOptions,
    tableRows,
    tableRowsTotalKg,
    manifestListTotal,
    manifestListPageCount,
    distributionManifestListReady,
    allActiveManifestsSorted,
    tripNumberById,
    openTripsForAssign,
    appendTargetManifest,
    appendMode,
    routeDetail,
    openManifestSummary,
    viewingArchivedManifest,
    tripForOpenManifest,
    crossWarehouseBlocked,
    warehouseName,
    viewingSaved,
    activeManifestId,
  };
}
