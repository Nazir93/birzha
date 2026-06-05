import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { BATCH_DESTINATIONS } from "@birzha/contracts";
import { apiGetJson, apiPostJson, postBatchWarehouseWriteOffQualityReject } from "../api/fetch-api.js";
import type { BatchListItem, CreateLoadingManifestResponse, LoadingManifestSummary } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { closedTripIdSet, filterTripsInWork, splitLoadingManifestsByArchive } from "../format/archive.js";
import { batchWarehouseId, isEligibleForLoadingAllocation } from "../format/batch-warehouse.js";
import {
  estimatedPackageCountOnShelf,
  filterBatchesForLoadingManifest,
  formatLoadingManifestDisplayName,
  resolveLoadingManifestNumberForSave,
} from "../format/loading-manifest.js";
import { sortLoadingManifestsByCreatedAtDesc } from "../format/loading-manifest-list.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import {
  readPreferredLoadingDestinationCode,
  readPreferredLoadingTripId,
  writePreferredLoadingDestinationCode,
  writePreferredLoadingTripId,
} from "../preferences/ops-preferred-loading-trip.js";
import {
  batchesFullListQueryOptions,
  loadingManifestDetailQueryOptions,
  loadingManifestReservedBatchIdsQueryOptions,
  loadingManifestsListQueryOptions,
  queryRoots,
  shipDestinationsFullListQueryOptions,
  tripsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import {
  adminAwarePathForPath,
  adminRoutes,
  ops,
  purchaseNakladnayaBasePathForPath,
} from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingManifestAccordion } from "./loading-manifest/LoadingManifestAccordion.js";
import { loadingSummaryFromDetail } from "./loading-manifest/loading-summary-from-detail.js";
import { LoadingManifestBlock, type LoadingManifestDocOption } from "./LoadingManifestBlock.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { btnStyle, fieldStyle, tableStyle, thHead, thtd } from "../ui/styles.js";

const labelsDestination: Record<(typeof BATCH_DESTINATIONS)[number], string> = {
  moscow: "Москва",
  regions: "Регионы",
  discount: "Уценка / распродажа",
  writeoff: "Списание",
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function documentOptionsForAllocation(
  batches: BatchListItem[],
): { id: string; number: string; checkboxLabel: string }[] {
  const byDoc = new Map<string, { number: string; grades: Set<string> }>();
  for (const b of batches) {
    const d = b.nakladnaya?.documentId;
    if (!d) {
      continue;
    }
    let entry = byDoc.get(d);
    if (!entry) {
      entry = {
        number: b.nakladnaya?.documentNumber?.trim() || "без номера",
        grades: new Set(),
      };
      byDoc.set(d, entry);
    }
    const code = b.nakladnaya?.productGradeCode?.trim();
    if (code) {
      entry.grades.add(code);
    }
  }
  const base = [...byDoc.entries()]
    .map(([id, { number, grades }]) => ({ id, number, grades }))
    .sort((a, b) => a.number.localeCompare(b.number, "ru"));
  const byNumberCount = new Map<string, number>();
  for (const o of base) {
    byNumberCount.set(o.number, (byNumberCount.get(o.number) ?? 0) + 1);
  }
  return base.map((o) => {
    const dup = (byNumberCount.get(o.number) ?? 0) > 1;
    const gradeHint = [...o.grades].sort((a, b) => a.localeCompare(b, "ru")).join(", ");
    const checkboxLabel = dup && gradeHint ? `№ ${o.number} · ${gradeHint}` : `№ ${o.number}`;
    return { id: o.id, number: o.number, checkboxLabel };
  });
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

export function AllocationPanel() {
  const { manifestId: routeManifestId = "" } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const purchaseNakladnayaBasePath = purchaseNakladnayaBasePathForPath(pathname);
  const distributionBase = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const archiveBase = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);
  const tripsBase = adminAwarePathForPath(pathname, adminRoutes.trips, ops.trips);
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");
  const [newManifestTripId, setNewManifestTripId] = useState(() => readPreferredLoadingTripId() ?? "");
  const [appendTargetManifestId, setAppendTargetManifestId] = useState<string | null>(null);

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

  const batchesQuery = useQuery(batchesFullListQueryOptions());
  const warehousesQuery = useQuery(warehousesFullListQueryOptions());
  const tripsQuery = useQuery(tripsFullListQueryOptions());
  const routeDetailQuery = useQuery({
    ...loadingManifestDetailQueryOptions(routeManifestId),
    enabled: Boolean(routeManifestId.trim()),
  });

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [loadNaklSelection, setLoadNaklSelection] = useState<Set<string>>(() => new Set());
  const [manifestDate, setManifestDate] = useState(todayDateOnly);
  const [manifestDestinationCode, setManifestDestinationCode] = useState<string>("");
  const [savedManifestId, setSavedManifestId] = useState<string>("");
  const [createManifestWarning, setCreateManifestWarning] = useState<string | null>(null);
  const [rejectScrapInput, setRejectScrapInput] = useState<Record<string, string>>({});
  /** Шаг 2 (город, дата, сохранение ПН) — только после списания и отбора. */
  const [manifestFormOpen, setManifestFormOpen] = useState(false);

  const activeManifestId = routeManifestId.trim() || savedManifestId;
  const viewingSaved = Boolean(routeManifestId.trim());

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

  const manifestsListQuery = useQuery(loadingManifestsListQueryOptions());

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
  const { active: activeManifests, archived: archivedManifests } = useMemo(
    () => splitLoadingManifestsByArchive(manifestsListQuery.data?.loadingManifests ?? [], closedIds),
    [manifestsListQuery.data?.loadingManifests, closedIds],
  );
  /** Без списка рейсов нельзя отделить архив — иначе накладные закрытых рейсов мелькают в «Погрузке». */
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
  const appendTargetManifest = useMemo(
    () => (appendTargetManifestId ? activeManifests.find((m) => m.id === appendTargetManifestId) ?? null : null),
    [activeManifests, appendTargetManifestId],
  );
  const appendMode = Boolean(appendTargetManifest);

  const startAnotherWarehouseLoad = useCallback(
    (tripId: string, manifestId: string, destinationCode: string) => {
      const id = tripId.trim();
      if (!id) {
        return;
      }
      setNewManifestTripId(id);
      setAppendTargetManifestId(manifestId.trim() || null);
      writePreferredLoadingTripId(id);
      setSelectedWarehouse("");
      writePreferredWarehouseId(null);
      setManifestFormOpen(false);
      setLoadNaklSelection(new Set());
      setSavedManifestId("");
      if (destinationCode.trim()) {
        setManifestDestinationCode(destinationCode.trim());
      }
      if (routeManifestId.trim()) {
        void navigate(distributionBase);
      }
    },
    [navigate, distributionBase, routeManifestId],
  );

  useEffect(() => {
    if (!tripsQuery.isSuccess || !newManifestTripId.trim()) {
      return;
    }
    if (!openTripsForAssign.some((t) => t.id === newManifestTripId.trim())) {
      setNewManifestTripId("");
      setAppendTargetManifestId(null);
      writePreferredLoadingTripId(null);
    }
  }, [tripsQuery.isSuccess, openTripsForAssign, newManifestTripId]);

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
    const fromArchive = archivedManifests.find((x) => x.id === id);
    if (fromArchive) {
      return fromArchive;
    }
    if (routeDetail && routeDetail.id === id) {
      return loadingSummaryFromDetail(routeDetail);
    }
    return null;
  }, [routeManifestId, activeManifests, archivedManifests, routeDetail]);

  const viewingArchivedManifest = useMemo(() => {
    const id = routeManifestId.trim();
    if (!id || !distributionManifestListReady) {
      return false;
    }
    return archivedManifests.some((m) => m.id === id);
  }, [routeManifestId, distributionManifestListReady, archivedManifests]);

  const assignTrip = useMutation({
    mutationFn: async () => {
      const id = routeManifestId.trim();
      if (!id || !assignTripId.trim()) {
        throw new Error("Выберите рейс для привязки.");
      }
      await apiPostJson(`/api/loading-manifests/${encodeURIComponent(id)}/assign-trip`, {
        tripId: assignTripId.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "list"] });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, routeManifestId.trim()] });
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
    },
  });

  const writeOff = useMutation({
    mutationFn: async ({ items }: { inputKey: string; items: { batchId: string; kg: number }[] }) => {
      for (const item of items) {
        await postBatchWarehouseWriteOffQualityReject(item.batchId, item.kg);
      }
    },
    onSuccess: (_d, { inputKey }) => {
      setRejectScrapInput((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "reserved-batch-ids"] });
      void queryClient.invalidateQueries({ queryKey: queryRoots.warehouseWriteOffsLedger });
    },
  });

  const createManifest = useMutation({
    mutationFn: async (payload: {
      appendToManifestId?: string;
      warehouseId: string;
      destinationCode: string;
      batchIds: string[];
      docDate: string;
      manifestNumber: string;
    }) => {
      const ensureTripAssigned = async (manifestId: string, tripId: string): Promise<string | null> => {
        const assignUrl = `/api/loading-manifests/${encodeURIComponent(manifestId)}/assign-trip`;
        const detailUrl = `/api/loading-manifests/${encodeURIComponent(manifestId)}`;
        const isAlreadyAssignedToTrip = async (): Promise<boolean> => {
          try {
            const detail = (await apiGetJson(detailUrl)) as { manifest?: { tripId?: string | null } };
            return (detail.manifest?.tripId?.trim() ?? "") === tripId;
          } catch {
            return false;
          }
        };

        try {
          await apiPostJson(assignUrl, { tripId });
          return null;
        } catch (firstError) {
          if (await isAlreadyAssignedToTrip()) {
            return null;
          }
          try {
            await apiPostJson(assignUrl, { tripId });
            return null;
          } catch (secondError) {
            if (await isAlreadyAssignedToTrip()) {
              return null;
            }
            const firstText = firstError instanceof Error && firstError.message.trim() ? firstError.message.trim() : "";
            const secondText =
              secondError instanceof Error && secondError.message.trim() ? secondError.message.trim() : "";
            const reason = secondText || firstText || "Не удалось привязать рейс.";
            return `Накладная сохранена, но рейс не привязался автоматически: ${reason}`;
          }
        }
      };

      if (payload.appendToManifestId?.trim()) {
        await apiPostJson(`/api/loading-manifests/${encodeURIComponent(payload.appendToManifestId)}/add-batches`, {
          batchIds: payload.batchIds,
        });
        return { manifestId: payload.appendToManifestId, assignTripWarning: null };
      }

      const res = (await apiPostJson("/api/loading-manifests", payload)) as CreateLoadingManifestResponse;
      const tripId = newManifestTripId.trim();
      let assignTripWarning: string | null = null;
      if (tripId) {
        assignTripWarning = await ensureTripAssigned(res.manifestId, tripId);
      }
      return { ...res, assignTripWarning };
    },
    onSuccess: (res) => {
      const tripId = newManifestTripId.trim();
      setSavedManifestId(res.manifestId);
      setLoadNaklSelection(new Set());
      setAppendTargetManifestId(null);
      setCreateManifestWarning(res.assignTripWarning ?? null);
      if (tripId) {
        setAssignTripId(tripId);
        writePreferredLoadingTripId(tripId);
      }
      if (manifestDestinationCode) {
        writePreferredLoadingDestinationCode(manifestDestinationCode);
      }
      void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
      void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
      void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "list"] });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "reserved-batch-ids"] });
      void navigate(`${distributionBase}/${encodeURIComponent(res.manifestId)}`);
    },
  });

  const batchesOnWarehouse = useMemo(
    () => (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0),
    [batchesQuery.data?.batches],
  );

  const list = useMemo(
    () =>
      batchesOnWarehouse
        .filter(isEligibleForLoadingAllocation)
        .filter((b) => !reservedBatchIdSet.has(b.id)),
    [batchesOnWarehouse, reservedBatchIdSet],
  );
  const loading = batchesQuery.isPending;
  const refetching = batchesQuery.isFetching && !batchesQuery.isPending;

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

  useEffect(() => {
    if (selectedWarehouse !== "" || allocationWarehouseOptions.length === 0 || viewingSaved) {
      return;
    }
    const pref = readPreferredWarehouseId();
    if (!pref && newManifestTripId.trim()) {
      return;
    }
    const withStock = allocationWarehouseOptions.filter((o) => o.batchCount > 0);
    if (withStock.length === 0) {
      return;
    }
    const pick = (pref ? withStock.find((o) => o.id === pref) : undefined) ?? withStock[0];
    if (pick) {
      setSelectedWarehouse(pick.id);
    }
  }, [allocationWarehouseOptions, selectedWarehouse, viewingSaved, newManifestTripId]);

  const clearWarehouseSelection = useCallback(() => {
    setSelectedWarehouse("");
    writePreferredWarehouseId(null);
    setManifestFormOpen(false);
    setLoadNaklSelection(new Set());
    setAppendTargetManifestId(null);
    if (routeManifestId.trim()) {
      void navigate(distributionBase);
    }
  }, [distributionBase, navigate, routeManifestId]);

  const selectedWarehouseRow = useMemo(
    () => allocationWarehouseOptions.find((o) => o.id === selectedWarehouse),
    [allocationWarehouseOptions, selectedWarehouse],
  );
  useEffect(() => {
    setManifestFormOpen(false);
    setRejectScrapInput({});
  }, [selectedWarehouse]);

  useEffect(() => {
    const id = routeManifestId.trim();
    if (!id) {
      return;
    }
    const fromList = activeManifests.find((x) => x.id === id);
    if (fromList) {
      setSelectedWarehouse(fromList.warehouseId);
      writePreferredWarehouseId(fromList.warehouseId);
      return;
    }
    if (routeDetail && routeDetail.id === id) {
      setSelectedWarehouse(routeDetail.warehouseId);
      writePreferredWarehouseId(routeDetail.warehouseId);
    }
  }, [routeManifestId, activeManifests, routeDetail]);

  const batchesInWh = useMemo(
    () => (selectedWarehouse ? (byWarehouse.get(selectedWarehouse) ?? []) : []),
    [byWarehouse, selectedWarehouse],
  );

  const documentOptions = useMemo(() => documentOptionsForAllocation(batchesInWh), [batchesInWh]);
  const docIdKey = useMemo(
    () =>
      documentOptions
        .map((d) => d.id)
        .sort()
        .join(","),
    [documentOptions],
  );
  const manifestDocumentOptions: LoadingManifestDocOption[] = useMemo(
    () => documentOptions.map((d) => ({ id: d.id, checkboxLabel: d.checkboxLabel })),
    [documentOptions],
  );

  useEffect(() => {
    if (!docIdKey) {
      setLoadNaklSelection(new Set());
      return;
    }
    setLoadNaklSelection(new Set(docIdKey.split(",")));
  }, [selectedWarehouse, docIdKey]);

  const onToggleNaklDoc = useCallback((id: string) => {
    setLoadNaklSelection((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }, []);
  const onSelectAllNakl = useCallback(() => {
    setLoadNaklSelection(new Set(documentOptions.map((d) => d.id)));
  }, [documentOptions]);
  const onClearNakl = useCallback(() => {
    setLoadNaklSelection(new Set());
  }, []);

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

  const inferredDestinationCode = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of tableRows) {
      const d = b.allocation?.destination;
      if (d && destAllowed.includes(d)) {
        counts.set(d, (counts.get(d) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? destAllowed[0] ?? "";
  }, [destAllowed, tableRows]);

  useEffect(() => {
    const preferred = readPreferredLoadingDestinationCode();
    if (preferred && destAllowed.includes(preferred)) {
      if (manifestDestinationCode !== preferred) {
        setManifestDestinationCode(preferred);
      }
      return;
    }
    const fallback = inferredDestinationCode || destAllowed[0] || "";
    if (!fallback) {
      return;
    }
    if (!manifestDestinationCode || !destAllowed.includes(manifestDestinationCode)) {
      setManifestDestinationCode(fallback);
    }
  }, [destAllowed, inferredDestinationCode, manifestDestinationCode]);

  const rowsFingerprint = useMemo(() => tableRows.map((b) => b.id).sort().join("|"), [tableRows]);
  const tableRowsTotalKg = useMemo(
    () => tableRows.reduce((a, b) => a + b.onWarehouseKg, 0),
    [tableRows],
  );
  useEffect(() => {
    if (!viewingSaved) {
      setSavedManifestId("");
      setCreateManifestWarning(null);
    }
  }, [selectedWarehouse, manifestDate, manifestDestinationCode, rowsFingerprint, viewingSaved]);

  useEffect(() => {
    if (tableRows.length === 0) {
      setManifestFormOpen(false);
    }
  }, [tableRows.length]);

  if (batchesQuery.isError) {
    return (
      <ErrorAlert message="Не удалось загрузить партии. Запустите API с PostgreSQL." title="Партии" />
    );
  }

  return (
    <div className="birzha-section-shell" role="region" aria-label="Погрузка на машину">
      <h2 className="birzha-section-title-main">Погрузка на машину</h2>

      {warehousesQuery.isError ? (
        <WarningAlert title="Склады">Справочник складов не загрузился — подписи к складу могут быть неполны.</WarningAlert>
      ) : null}

      {loading && <LoadingBlock label="Загрузка партий…" minHeight={100} skeleton skeletonRows={6} />}

      <StaleDataNotice show={refetching} label="Обновление списка партий…" />
      <StaleDataNotice
        show={Boolean(selectedWarehouse) && reservedBatchIdsQuery.isFetching && !reservedBatchIdsQuery.isPending}
        label="Обновление учёта погрузочных накладных…"
      />

      {!loading && !viewingSaved && allocationWarehouseOptions.length > 0 ? (
        <div className="no-print birzha-section-filters">
          <label
            htmlFor="alloc-sel-warehouse"
            className="birzha-form-label birzha-form-label--block birzha-form-label--mb-sm"
          >
            Склад *
          </label>
          <select
            id="alloc-sel-warehouse"
            value={selectedWarehouse}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedWarehouse(v);
              writePreferredWarehouseId(v === "" ? null : v);
              if (routeManifestId.trim()) {
                void navigate(distributionBase);
              }
            }}
            style={{ ...fieldStyle, maxWidth: "100%" }}
          >
            <option value="">— выберите склад —</option>
            {allocationWarehouseOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {warehouseName(row.id)} — {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
                {row.linesWithBoxData > 0 ? `, ≈ ${row.packageEstimate.toLocaleString("ru-RU")} ящ.` : ""}
                {`, ${row.batchCount} парт.`}
              </option>
            ))}
          </select>
          {selectedWarehouse ? (
            <p style={{ margin: "0.65rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
              <span className="birzha-text-muted birzha-ui-sm">
                Выбран: <strong>{warehouseName(selectedWarehouse)}</strong>
                {selectedWarehouseRow != null
                  ? ` · ${selectedWarehouseRow.batchCount} парт. для отбора`
                  : null}
              </span>
              <button type="button" style={btnStyle} onClick={clearWarehouseSelection}>
                ← Сменить склад
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && !viewingSaved && selectedWarehouse && reservedBatchIdsQuery.isError && (
        <p className="birzha-callout-warning" role="status">
          Не удалось загрузить список партий, уже внесённых в погрузочные накладные — отбор показывает полный остаток.
        </p>
      )}
      {!loading && manifestsListQuery.isError ? (
        <ErrorAlert message="Не удалось загрузить список погрузочных накладных." title="Погрузочные накладные" />
      ) : null}
      {!loading && !viewingSaved && tripsQuery.isError ? (
        <ErrorAlert error={tripsQuery.error} message="Не удалось загрузить рейсы — список накладных скрыт." title="Рейсы" />
      ) : null}
      {!loading && !viewingSaved && !distributionManifestListReady && !tripsQuery.isError && !manifestsListQuery.isError ? (
        <LoadingBlock label="Список погрузочных накладных…" minHeight={48} skeleton skeletonRows={2} />
      ) : null}

      {!loading && !viewingSaved && distributionManifestListReady && allActiveManifestsSorted.length > 0 ? (
        <BirzhaDisclosure
          defaultOpen
          title={
            <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>
              Сохранённые погрузочные накладные ({allActiveManifestsSorted.length})
            </span>
          }
        >
          <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
            <table style={{ ...tableStyle, minWidth: 720 }} aria-label="Все погрузочные накладные">
              <thead>
                <tr>
                  <th scope="col" style={thHead}>
                    Накладная
                  </th>
                  <th scope="col" style={thHead}>
                    Рейс
                  </th>
                  <th scope="col" style={thHead}>
                    Дата
                  </th>
                  <th scope="col" style={thHead}>
                    Склад
                  </th>
                  <th scope="col" style={thHead}>
                    Город
                  </th>
                  <th scope="col" style={{ ...thHead, textAlign: "right" }}>
                    Кг
                  </th>
                  <th scope="col" style={thHead} />
                </tr>
              </thead>
              <tbody>
                {allActiveManifestsSorted.map((m) => {
                  const isCurrent = m.id === activeManifestId;
                  return (
                    <tr
                      key={m.id}
                      style={isCurrent ? { background: "rgba(59, 130, 246, 0.09)" } : undefined}
                    >
                      <td style={thtd}>
                        <strong>
                          {formatLoadingManifestDisplayName({
                            manifestNumber: m.manifestNumber,
                            destinationName: m.destinationName,
                          })}
                        </strong>
                      </td>
                      <td style={thtd}>{m.tripId ? (tripNumberById.get(m.tripId) ?? "—") : "—"}</td>
                      <td style={thtd}>{m.docDate}</td>
                      <td style={thtd}>{m.warehouseName}</td>
                      <td style={thtd}>{m.destinationName}</td>
                      <td style={{ ...thtd, textAlign: "right" }}>
                        {m.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                      </td>
                      <td style={thtd}>
                        <Link
                          to={`${distributionBase}/${encodeURIComponent(m.id)}`}
                          style={{ fontWeight: 600 }}
                        >
                          {isCurrent ? "Открыта" : "Открыть · печать"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BirzhaDisclosure>
      ) : null}

      {!loading && distributionManifestListReady && !viewingSaved && allActiveManifestsSorted.length === 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem" }} role="status">
          Сохранённых погрузочных накладных пока нет. После «Сохранить погрузочную накладную» строка появится в таблице
          на этой странице. Накладные закрытых рейсов — в разделе <Link to={archiveBase}>«Архив»</Link>.
        </p>
      ) : null}

      {!loading && !viewingSaved && batchesOnWarehouseWithoutWarehouse.length > 0 ? (
        <InfoAlert title="У партий не указан склад">
          На складе числится остаток ({batchesOnWarehouseWithoutWarehouse.length} парт.) без привязки к складу в системе.
          Укажите склад при приёмке в <Link to={purchaseNakladnayaBasePath}>Закупке товара</Link>.
        </InfoAlert>
      ) : null}
      {!loading &&
      !viewingSaved &&
      !selectedWarehouse &&
      list.length === 0 &&
      eligibleBatchesOnWarehouse.length === 0 &&
      batchesOnWarehouse.length > 0 &&
      batchesOnWarehouseWithoutWarehouse.length === 0 &&
      !allEligibleStockReserved ? (
        <InfoAlert title="Нет партий для отбора">
          На складе есть остаток ({batchesOnWarehouse.length} парт.), но без привязки к номеру{" "}
          <strong>закупочной накладной</strong> (для группировки). Оформите приём в{" "}
          <Link to={purchaseNakladnayaBasePath}>Закупке товара</Link> или откройте уже сохранённые погрузочные выше.
          <p style={{ margin: "0.5rem 0 0" }}>
            <button
              type="button"
              style={btnStyle}
              disabled={batchesQuery.isFetching}
              onClick={() => void batchesQuery.refetch()}
            >
              {batchesQuery.isFetching ? "Обновление…" : "Обновить список партий"}
            </button>
          </p>
        </InfoAlert>
      ) : null}
      {!loading && !viewingSaved && !selectedWarehouse && list.length === 0 && batchesOnWarehouse.length === 0 && (
        <BirzhaEmptyState
          compact
          title="Нет партий с остатком на складе"
          description={
            <>
              Сначала оформите закупку товара (раздел <Link to={purchaseNakladnayaBasePath}>Закупка товара</Link>).
            </>
          }
        />
      )}

      {showWorkspace && (
        <>
          {viewingSaved ? (
            <div style={{ marginBottom: "1.1rem" }}>
              <p className="no-print" style={{ margin: "0 0 0.5rem" }}>
                <Link to={distributionBase} style={{ fontWeight: 600 }}>
                  ← Новая погрузочная накладная
                </Link>
              </p>
              {viewingArchivedManifest ? (
                <InfoAlert title="Накладная в архиве">
                  Рейс по этой погрузочной закрыт — в рабочем списке «Погрузки» она не показывается. Открыть все архивные
                  накладные: <Link to={archiveBase}>Архив</Link>.
                </InfoAlert>
              ) : null}
              {createManifestWarning ? (
                <WarningAlert title="Проверьте привязку рейса">{createManifestWarning}</WarningAlert>
              ) : null}
              {openManifestSummary?.tripId && !viewingArchivedManifest ? (
                <p className="no-print" style={{ margin: "0 0 0.75rem" }}>
                  <button
                    type="button"
                    style={btnStyle}
                    onClick={() =>
                      startAnotherWarehouseLoad(
                        openManifestSummary.tripId!,
                        openManifestSummary.id,
                        openManifestSummary.destinationCode,
                      )
                    }
                  >
                    Загрузить ещё с другого склада в этот рейс
                  </button>
                </p>
              ) : null}
              {openManifestSummary ? (
                <LoadingManifestAccordion
                  m={openManifestSummary}
                  manifestId={routeManifestId.trim()}
                  manifestBasePath={distributionBase}
                  tripNumberById={tripNumberById}
                  detail={routeDetail && routeDetail.id === openManifestSummary.id ? routeDetail : null}
                  detailLoading={routeDetailQuery.isPending}
                  detailError={routeDetailQuery.isError}
                  assignTripId={assignTripId}
                  setAssignTripId={setAssignTripId}
                  assignTrip={assignTrip}
                  trips={openTripsForAssign}
                />
              ) : routeDetailQuery.isPending ? (
                <LoadingBlock label="Загрузка погрузочной накладной…" minHeight={80} skeleton skeletonRows={3} />
              ) : routeDetailQuery.isError ? (
                <ErrorAlert
                  error={routeDetailQuery.error}
                  message="Не удалось открыть погрузочную накладную."
                  title="Погрузочная накладная"
                />
              ) : (
                <InfoAlert title="Накладная не найдена">
                  Проверьте ссылку или выберите накладную в списке ниже.
                </InfoAlert>
              )}
            </div>
          ) : null}

          {selectedWarehouse && !viewingSaved ? (
            <>
              <BirzhaDisclosure
                defaultOpen
                title={<span style={{ fontSize: "0.95rem", fontWeight: 600 }}>1. Списание и отбор партий</span>}
              >
                {meta?.warehouseWriteOffApi !== "enabled" ? (
                  <InfoAlert title="Списание недоступно">
                    Списание со склада работает при подключённой базе PostgreSQL. Пока можно только собрать погрузочную
                    накладную без списания.
                  </InfoAlert>
                ) : null}
                {documentOptions.length === 0 && batchesInWh.length > 0 && (
                  <p className="birzha-callout-info" role="status">
                    На складе нет привязки к номеру накладной — показаны все партии с остатком.
                  </p>
                )}
                <LoadingManifestBlock
                  documentOptions={manifestDocumentOptions}
                  selectedDocIds={loadNaklSelection}
                  onToggleNaklDoc={onToggleNaklDoc}
                  onSelectAllNakl={onSelectAllNakl}
                  onClearNakl={onClearNakl}
                  batchesInWh={batchesInWh}
                  warehouseName={warehouseName(selectedWarehouse)}
                  manifest={savedManifestQuery.data?.manifest ?? null}
                  writeOff={
                    meta?.warehouseWriteOffApi === "enabled" && batchesInWh.length > 0
                      ? {
                          enabled: true,
                          isPending: writeOff.isPending,
                          isError: writeOff.isError,
                          errorMessage: writeOff.isError ? (writeOff.error as Error).message : null,
                          rejectInput: rejectScrapInput,
                          onRejectInputChange: (key, value) =>
                            setRejectScrapInput((prev) => ({ ...prev, [key]: value })),
                          onSubmitWriteOff: (inputKey, items) => writeOff.mutate({ inputKey, items }),
                        }
                      : null
                  }
                />
                <div
                  className="no-print"
                  style={{
                    marginTop: "1rem",
                    paddingTop: "0.85rem",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  {tableRows.length > 0 ? (
                    <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.65rem" }}>
                      В отборе: <strong>{tableRows.length}</strong> парт.,{" "}
                      <strong>{tableRowsTotalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    style={btnStyle}
                    disabled={tableRows.length === 0}
                    onClick={() => setManifestFormOpen(true)}
                  >
                    Готово — погрузочная накладная
                  </button>
                </div>
              </BirzhaDisclosure>

              {manifestFormOpen ? (
              <div className="birzha-section-filters" role="region" aria-label="Новая погрузочная накладная">
                <p className="no-print" style={{ margin: "0 0 0.5rem" }}>
                  <button
                    type="button"
                    style={{
                      fontWeight: 600,
                      padding: 0,
                      border: "none",
                      background: "none",
                      cursor: "pointer",
                      color: "var(--birzha-accent)",
                      textDecoration: "underline",
                    }}
                    onClick={() => setManifestFormOpen(false)}
                  >
                    ← Вернуться к списанию и отбору
                  </button>
                </p>
                <h3 className="birzha-section-title-inline">2. Погрузочная накладная</h3>
                {appendMode && appendTargetManifest ? (
                  <InfoAlert title="Добавление в существующую погрузочную">
                    Товар будет добавлен в уже открытую погрузочную:{" "}
                    <strong>
                      {formatLoadingManifestDisplayName({
                        manifestNumber: appendTargetManifest.manifestNumber,
                        destinationName: appendTargetManifest.destinationName,
                      })}
                    </strong>
                    . Новая погрузочная создана не будет.
                  </InfoAlert>
                ) : null}
                <div className="birzha-form-grid">
                  <label>
                    Рейс *
                    <select
                      value={newManifestTripId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewManifestTripId(v);
                        writePreferredLoadingTripId(v.trim() || null);
                      }}
                      style={fieldStyle}
                      disabled={tripsQuery.isPending || appendMode}
                    >
                      <option value="">
                        {tripsQuery.isPending
                          ? "— загрузка рейсов —"
                          : openTripsForAssign.length === 0
                            ? "— сначала создайте рейс —"
                            : "— выберите рейс —"}
                      </option>
                      {openTripsForAssign.map((t) => (
                        <option key={t.id} value={t.id}>
                          {formatTripSelectLabel(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Город / направление *
                    <select
                      value={manifestDestinationCode}
                      onChange={(e) => {
                        const v = e.target.value;
                        setManifestDestinationCode(v);
                        writePreferredLoadingDestinationCode(v || null);
                      }}
                      style={fieldStyle}
                      disabled={appendMode}
                    >
                      {destAllowed.map((d) => (
                        <option key={d} value={d}>
                          {labelDest[d] ?? d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Дата *
                    <BirzhaDateField value={manifestDate} onChange={setManifestDate} style={fieldStyle} />
                  </label>
                </div>
                {openTripsForAssign.length === 0 && !tripsQuery.isPending ? (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                    Создайте рейс в разделе{" "}
                    <Link to={tripsBase} style={{ fontWeight: 600 }}>
                      «Рейсы»
                    </Link>
                    , затем выберите его здесь — кг уйдут в рейс при сохранении.
                  </p>
                ) : null}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    style={btnStyle}
                    disabled={
                      createManifest.isPending ||
                      tableRows.length === 0 ||
                      (!appendMode &&
                        (!manifestDate ||
                          !manifestDestinationCode ||
                          !newManifestTripId.trim() ||
                          openTripsForAssign.length === 0))
                    }
                    onClick={() => {
                      if (appendMode && appendTargetManifest) {
                        createManifest.mutate({
                          appendToManifestId: appendTargetManifest.id,
                          warehouseId: selectedWarehouse,
                          destinationCode: appendTargetManifest.destinationCode,
                          batchIds: tableRows.map((b) => b.id),
                          docDate: appendTargetManifest.docDate,
                          manifestNumber: appendTargetManifest.manifestNumber,
                        });
                        return;
                      }
                      const destLabel = labelDest[manifestDestinationCode] ?? manifestDestinationCode;
                      const tripId = newManifestTripId.trim();
                      const trip = openTripsForAssign.find((t) => t.id === tripId);
                      createManifest.mutate({
                        warehouseId: selectedWarehouse,
                        destinationCode: manifestDestinationCode,
                        batchIds: tableRows.map((b) => b.id),
                        docDate: manifestDate,
                        manifestNumber: resolveLoadingManifestNumberForSave({
                          tripNumber: trip?.tripNumber,
                          destinationLabel: destLabel,
                          docDate: manifestDate,
                          takenNumbers: (manifestsListQuery.data?.loadingManifests ?? []).map((m) => m.manifestNumber),
                        }),
                      });
                    }}
                  >
                    {createManifest.isPending
                      ? "Сохранение…"
                      : appendMode
                        ? "Добавить в текущую погрузочную"
                        : "Сохранить погрузочную накладную"}
                  </button>
                </div>
                {createManifest.isError ? (
                  <ErrorAlert
                    error={createManifest.error}
                    message="Не удалось сохранить. Выберите рейс, город, дату и отмеченные партии."
                    title="Сохранение"
                  />
                ) : null}
                {tableRows.length > 0 ? (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                    В накладную: <strong>{tableRows.length}</strong> парт.,{" "}
                    <strong>
                      {tableRows
                        .reduce((a, b) => a + b.onWarehouseKg, 0)
                        .toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </strong>{" "}
                    кг · {labelDest[manifestDestinationCode] ?? manifestDestinationCode}
                  </p>
                ) : null}
              </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
