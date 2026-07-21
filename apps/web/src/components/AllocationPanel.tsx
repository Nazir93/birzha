import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { apiGetJson, apiPostJson, deleteLoadingManifestById, deleteWarehouseWriteOffById, postBatchWarehouseWriteOffQualityReject } from "../api/fetch-api.js";
import type { CreateLoadingManifestResponse, LoadingManifestSummary } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { canShipLoadingManifest, canRecordWarehouseReturn } from "../auth/role-panels.js";
import { formatLoadingManifestTableNumberLabel } from "../format/loading-manifest.js";
import { formatAllocationWarehouseSelectLabel } from "../format/allocation-warehouse-option.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { isLoadingManifestNotFoundError, humanizeErrorMessage } from "../format/user-facing-error.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import {
  readPreferredLoadingDestinationCode,
  readPreferredLoadingTripId,
  writePreferredLoadingDestinationCode,
  writePreferredLoadingTripId,
} from "../preferences/ops-preferred-loading-trip.js";
import { tripLocksManifestDestination } from "../format/loading-manifest-trip-destination.js";
import { queryRoots } from "../query/core-list-queries.js";
import { refreshDistributionLists } from "../query/domain-list-refresh.js";
import {
  adminAwarePathForPath,
  adminRoutes,
  ops,
  purchaseNakladnayaBasePathForPath,
} from "../routes.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { LoadingManifestAccordion } from "./loading-manifest/LoadingManifestAccordion.js";
import { LoadingManifestBlock } from "./LoadingManifestBlock.js";
import { DistributionCreateForm } from "./distribution/DistributionCreateForm.js";
import { DistributionManifestListTable } from "./distribution/DistributionManifestListTable.js";
import type { RecentWriteOffRow } from "./distribution/WriteOffRecentList.js";
import { useDistributionWorkspace } from "./distribution/useDistributionWorkspace.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { ErrorAlert, InfoAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { btnClassSpaced, selectFieldStyle } from "../ui/styles.js";
import { BirzhaSelect } from "../ui/BirzhaSelect.js";

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AllocationPanel() {
  const { manifestId: routeManifestId = "" } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const focusTripId = searchParams.get("trip")?.trim() ?? "";
  const { meta, user } = useAuth();
  const canShip = canShipLoadingManifest(user);
  const canReturn = canRecordWarehouseReturn(user);
  const purchaseNakladnayaBasePath = purchaseNakladnayaBasePathForPath(pathname);
  const distributionBase = adminAwarePathForPath(pathname, adminRoutes.distribution, ops.distribution);
  const appendBase = adminAwarePathForPath(pathname, adminRoutes.loadingAppend, ops.loadingAppend);
  const tripBase = adminAwarePathForPath(pathname, adminRoutes.loadingTrip, ops.loadingTrip);
  const archiveBase = adminAwarePathForPath(pathname, adminRoutes.archive, ops.archive);
  const tripsBase = adminAwarePathForPath(pathname, adminRoutes.trips, ops.trips);
  const queryClient = useQueryClient();
  const [newManifestTripId, setNewManifestTripId] = useState(
    () => focusTripId || readPreferredLoadingTripId() || "",
  );
  const [appendTargetManifestId, setAppendTargetManifestId] = useState<string | null>(null);

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [loadNaklSelection, setLoadNaklSelection] = useState<Set<string>>(() => new Set());
  const [manifestDate, setManifestDate] = useState(todayDateOnly);
  const [manifestDestinationCode, setManifestDestinationCode] = useState<string>("");
  const [savedManifestId, setSavedManifestId] = useState<string>("");
  const [createManifestWarning, setCreateManifestWarning] = useState<string | null>(null);
  const [rejectScrapInput, setRejectScrapInput] = useState<Record<string, string>>({});
  const [rejectScrapPkgInput, setRejectScrapPkgInput] = useState<Record<string, string>>({});
  /** Шаг 2 (город, дата, сохранение ПН) — только после возврата на склад и отбора. */
  const [manifestFormOpen, setManifestFormOpen] = useState(false);
  const [manifestListPage, setManifestListPage] = useState(0);
  const [deleteManifestError, setDeleteManifestError] = useState<string | null>(null);
  const [deletingManifestId, setDeletingManifestId] = useState<string | null>(null);
  const [recentWriteOffs, setRecentWriteOffs] = useState<RecentWriteOffRow[]>([]);
  const [writeOffUndoError, setWriteOffUndoError] = useState<string | null>(null);
  const [undoingWriteOffId, setUndoingWriteOffId] = useState<string | null>(null);

  const workspace = useDistributionWorkspace({
    routeManifestId,
    selectedWarehouse,
    manifestListPage,
    savedManifestId,
    appendTargetManifestId,
    loadNaklSelection,
    distributionBase,
    filterTripId: focusTripId,
  });

  const {
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
    warehouseName,
    viewingSaved,
    activeManifestId,
  } = workspace;

  useEffect(() => {
    if (!focusTripId) {
      return;
    }
    setManifestListPage(0);
    setNewManifestTripId(focusTripId);
    writePreferredLoadingTripId(focusTripId);
  }, [focusTripId]);

  useEffect(() => {
    if (!focusTripId || !tripsQuery.isSuccess) {
      return;
    }
    const trip = openTripsForAssign.find((t) => t.id === focusTripId);
    const tripDest = trip?.destinationCode?.trim() ?? "";
    if (tripDest && destAllowed.includes(tripDest)) {
      setManifestDestinationCode(tripDest);
      writePreferredLoadingDestinationCode(tripDest);
    }
  }, [focusTripId, tripsQuery.isSuccess, openTripsForAssign, destAllowed]);

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

  const deleteLoadingManifest = useMutation({
    mutationFn: async (manifestId: string) => {
      setDeleteManifestError(null);
      setDeletingManifestId(manifestId);
      await deleteLoadingManifestById(manifestId, "Недостаточно прав: удаление погрузочных накладных — только admin.");
    },
    onSuccess: async (_data, manifestId) => {
      await refreshDistributionLists(queryClient);
      if (manifestId === activeManifestId) {
        const back = focusTripId
          ? `${distributionBase}?${new URLSearchParams({ trip: focusTripId }).toString()}`
          : distributionBase;
        void navigate(back);
      }
    },
    onError: (e: unknown) => setDeleteManifestError(humanizeErrorMessage(e)),
    onSettled: () => setDeletingManifestId(null),
  });

  const handleDeleteManifest = useCallback(
    (manifest: LoadingManifestSummary) => {
      const tripLabel = manifest.tripId ? (tripNumberById.get(manifest.tripId) ?? "—") : "—";
      const label = formatLoadingManifestTableNumberLabel({
        manifestNumber: manifest.manifestNumber,
        destinationName: manifest.destinationName,
        docDate: manifest.docDate,
        tripLabel,
      });
      const confirmLabel = label === "—" ? manifest.destinationName || "без номера" : label;
      if (
        window.confirm(
          `Удалить погрузочную накладную ${confirmLabel}? Отгруженные в рейс удалить нельзя.`,
        )
      ) {
        void deleteLoadingManifest.mutate(manifest.id);
      }
    },
    [deleteLoadingManifest, tripNumberById],
  );

  const writeOff = useMutation({
    mutationFn: async ({
      items,
      label,
    }: {
      inputKey: string;
      items: { batchId: string; kg: number }[];
      label: string;
    }) => {
      const entries: RecentWriteOffRow[] = [];
      for (const item of items) {
        const { writeOffId } = await postBatchWarehouseWriteOffQualityReject(item.batchId, item.kg);
        entries.push({ writeOffId, kg: item.kg, label });
      }
      return { entries };
    },
    onSuccess: (result, { inputKey }) => {
      setWriteOffUndoError(null);
      setRejectScrapInput((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      setRejectScrapPkgInput((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
      setRecentWriteOffs((prev) => [...prev, ...result.entries]);
      void refreshDistributionLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryRoots.warehouseWriteOffsLedger });
    },
  });

  const undoWriteOff = useMutation({
    mutationFn: async (writeOffId: string) => {
      setWriteOffUndoError(null);
      setUndoingWriteOffId(writeOffId);
      await deleteWarehouseWriteOffById(writeOffId);
    },
    onSuccess: (_data, writeOffId) => {
      setRecentWriteOffs((prev) => prev.filter((r) => r.writeOffId !== writeOffId));
      void refreshDistributionLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryRoots.warehouseWriteOffsLedger });
    },
    onError: (e: unknown) => setWriteOffUndoError(humanizeErrorMessage(e)),
    onSettled: () => setUndoingWriteOffId(null),
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
        writePreferredLoadingTripId(tripId);
      }
      if (manifestDestinationCode) {
        writePreferredLoadingDestinationCode(manifestDestinationCode);
      }
      void refreshDistributionLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
      void navigate(`${distributionBase}/${encodeURIComponent(res.manifestId)}`);
    },
  });

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
      const back = focusTripId
        ? `${distributionBase}?${new URLSearchParams({ trip: focusTripId }).toString()}`
        : distributionBase;
      void navigate(back);
    }
  }, [distributionBase, focusTripId, navigate, routeManifestId]);

  useEffect(() => {
    setManifestFormOpen(false);
    setRejectScrapInput({});
  }, [selectedWarehouse]);

  useEffect(() => {
    const id = routeManifestId.trim();
    if (!id) {
      return;
    }
    const fromList = allActiveManifestsSorted.find((x) => x.id === id);
    if (fromList) {
      setSelectedWarehouse(fromList.warehouseId);
      writePreferredWarehouseId(fromList.warehouseId);
      return;
    }
    if (routeDetail && routeDetail.id === id) {
      setSelectedWarehouse(routeDetail.warehouseId);
      writePreferredWarehouseId(routeDetail.warehouseId);
    }
  }, [routeManifestId, allActiveManifestsSorted, routeDetail]);

  const docIdKey = useMemo(
    () =>
      documentOptions
        .map((d) => d.id)
        .sort()
        .join(","),
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
    const trip = openTripsForAssign.find((t) => t.id === newManifestTripId.trim());
    const tripDest = trip?.destinationCode?.trim() ?? "";
    if (tripLocksManifestDestination(trip) && tripDest && destAllowed.includes(tripDest)) {
      if (manifestDestinationCode !== tripDest) {
        setManifestDestinationCode(tripDest);
        writePreferredLoadingDestinationCode(tripDest);
      }
      return;
    }
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
  }, [
    destAllowed,
    inferredDestinationCode,
    manifestDestinationCode,
    newManifestTripId,
    openTripsForAssign,
  ]);

  const rowsFingerprint = useMemo(() => tableRows.map((b) => b.id).sort().join("|"), [tableRows]);
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

  if (batchesQueryError) {
    return (
      <ErrorAlert
        message={batchesQueryErrorMessage ?? "Не удалось загрузить партии."}
        title="Партии"
      />
    );
  }

  const manifestDetailNotFound =
    viewingSaved && routeDetailQuery.isError && isLoadingManifestNotFoundError(routeDetailQuery.error);

  const focusTrip = focusTripId
    ? openTripsForAssign.find((t) => t.id === focusTripId) ?? null
    : null;
  const focusTripCity =
    focusTrip?.destinationCode?.trim() && labelDest[focusTrip.destinationCode.trim()]
      ? labelDest[focusTrip.destinationCode.trim()]
      : focusTrip?.destinationCode?.trim() || "";
  const distributionScopedHref = focusTripId
    ? `${distributionBase}?${new URLSearchParams({ trip: focusTripId }).toString()}`
    : distributionBase;

  return (
    <section className="birzha-panel birzha-clean-ops-page" aria-labelledby="distribution-heading" role="region" aria-label="Погрузка на машину">
      <BirzhaDisclosure
        defaultOpen
        className="birzha-clean-ops-disclosure"
        title={
          <div className="birzha-section-heading">
            <div>
              <p className="birzha-section-heading__eyebrow">Логистика</p>
              <h3 id="distribution-heading" className="birzha-section-title birzha-section-title--sm">
                Погрузка на машину
              </h3>
            </div>
          </div>
        }
      >
      {focusTripId ? (
        <InfoAlert title="Операции по рейсу">
          Показаны погрузочные и форма для рейса{" "}
          <strong>{focusTrip ? formatTripSelectLabel(focusTrip) : focusTripId}</strong>
          {focusTripCity ? (
            <>
              {" "}
              · город <strong>{focusTripCity}</strong>
            </>
          ) : null}
          .{" "}
          <Link to={distributionBase} style={{ fontWeight: 600 }}>
            Показать все погрузочные
          </Link>
        </InfoAlert>
      ) : null}
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
        <div className="no-print birzha-clean-ops-meta-grid birzha-clean-ops-meta-grid--warehouse">
          <label htmlFor="alloc-sel-warehouse" className="birzha-form-label">
            Склад *
            <BirzhaSelect
              id="alloc-sel-warehouse"
              value={selectedWarehouse}
              onChange={(v) => {
                setSelectedWarehouse(v);
                writePreferredWarehouseId(v === "" ? null : v);
                setRecentWriteOffs([]);
                if (routeManifestId.trim()) {
                  void navigate(distributionScopedHref);
                }
              }}
              style={selectFieldStyle}
              placeholder="— выберите склад —"
              options={[
                { value: "", label: "— выберите склад —" },
                ...allocationWarehouseOptions.map((row) => ({
                  value: row.id,
                  label: formatAllocationWarehouseSelectLabel(warehouseName(row.id), row),
                })),
              ]}
            />
          </label>
          {selectedWarehouse ? (
            <div className="birzha-distribution-warehouse-meta birzha-form-label">
              <span className="birzha-text-muted birzha-ui-sm">
                Выбран: <strong>{warehouseName(selectedWarehouse)}</strong>
                {selectedWarehouseRow != null ? ` · ${selectedWarehouseRow.batchCount} парт. для отбора` : null}
              </span>
              <button type="button" className={btnClassSpaced} onClick={clearWarehouseSelection}>
                ← Сменить склад
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showWorkspace && selectedWarehouse && !viewingSaved ? (
        <>
          <h4 className="birzha-clean-ops-list__title birzha-clean-ops-list__title--step">1. Возврат на склад и отбор партий</h4>
          {meta?.warehouseWriteOffApi !== "enabled" ? (
            <InfoAlert title="Возврат на склад недоступен">
              Возврат на склад работает при подключённой базе PostgreSQL. Пока можно только собрать погрузочную
              накладную без возврата.
            </InfoAlert>
          ) : null}
          {documentOptions.length === 0 && batchesInWh.length > 0 ? (
            <p className="birzha-callout-info" role="status">
              На складе нет привязки к номеру накладной — показаны все партии с остатком.
            </p>
          ) : null}
          {selectedWarehouseRow != null &&
          selectedWarehouseRow.batchCount === 0 &&
          selectedWarehouseRow.totalBatchCountOnWarehouse > 0 ? (
            <InfoAlert title="Остаток в погрузочной накладной">
              На складе{" "}
              <strong>
                {selectedWarehouseRow.totalKgOnWarehouse.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
              </strong>{" "}
              ({selectedWarehouseRow.totalBatchCountOnWarehouse} парт.) уже учтены в активных погрузочных накладных — для
              нового отбора свободных партий нет. Откройте сохранённую накладную в таблице выше или раздел{" "}
              <Link to={appendBase}>«Догрузка»</Link>, если
              нужно добавить партии.
            </InfoAlert>
          ) : null}
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
              meta?.warehouseWriteOffApi === "enabled" &&
              canReturn &&
              (batchesInWh.length > 0 || (savedManifestQuery.data?.manifest?.lines.length ?? 0) > 0)
                ? {
                    enabled: true,
                    isPending: writeOff.isPending,
                    isError: writeOff.isError,
                    errorMessage: writeOff.isError ? humanizeErrorMessage(writeOff.error) : null,
                    rejectInput: rejectScrapInput,
                    rejectPkgInput: rejectScrapPkgInput,
                    onRejectInputChange: (key, value) => setRejectScrapInput((prev) => ({ ...prev, [key]: value })),
                    onRejectPkgInputChange: (key, value) => setRejectScrapPkgInput((prev) => ({ ...prev, [key]: value })),
                    onSubmitWriteOff: (inputKey, items, label) => writeOff.mutate({ inputKey, items, label }),
                    recentWriteOffs,
                    undoingWriteOffId,
                    undoError: writeOffUndoError,
                    onUndoWriteOff: (writeOffId) => void undoWriteOff.mutate(writeOffId),
                  }
                : null
            }
          />
          <p className="birzha-clean-ops-form-actions no-print">
            {tableRows.length > 0 ? (
              <span className="birzha-text-muted birzha-ui-sm" style={{ width: "100%", marginBottom: "0.35rem" }}>
                В отборе: <strong>{tableRows.length}</strong> парт.,{" "}
                <strong>{tableRowsTotalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</strong> кг.
              </span>
            ) : null}
            {canShip ? (
              <button
                type="button"
                className={btnClassSpaced}
                disabled={tableRows.length === 0}
                onClick={() => setManifestFormOpen(true)}
              >
                Готово — погрузочная накладная
              </button>
            ) : (
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: 0 }} role="status">
                Сохранение погрузочной накладной и привязка к рейсу — у кладовщика или логиста. Здесь доступен просмотр.
              </p>
            )}
          </p>
        </>
      ) : null}
      </BirzhaDisclosure>

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
        <>
          {deleteManifestError ? (
            <ErrorAlert message={deleteManifestError} title="Удаление погрузочной накладной" />
          ) : null}
          <DistributionManifestListTable
            manifests={allActiveManifestsSorted}
            totalCount={manifestListTotal}
            pageIndex={manifestListPage}
            pageCount={manifestListPageCount}
            distributionBase={distributionBase}
            activeManifestId={activeManifestId}
            tripNumberById={tripNumberById}
            deletingManifestId={deletingManifestId}
            onPageChange={setManifestListPage}
            onDelete={handleDeleteManifest}
          />
        </>
      ) : null}

      {!loading && distributionManifestListReady && !viewingSaved && allActiveManifestsSorted.length === 0 ? (
        <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem" }} role="status">
          {focusTripId
            ? "У этого рейса пока нет сохранённых погрузочных накладных. Выберите склад ниже и создайте погрузку — рейс и город уже подставлены."
            : "Сохранённых погрузочных накладных пока нет. После «Сохранить погрузочную накладную» строка появится в таблице на этой странице."}{" "}
          Накладные закрытых рейсов — в разделе <Link to={archiveBase}>«Архив»</Link>.
        </p>
      ) : null}

      {!loading && !viewingSaved && allEligibleStockReserved ? (
        <BirzhaEmptyState
          compact
          title="Весь остаток уже в погрузочных накладных"
          description={
            <>
              Свободных партий для новой ПН нет — откройте сохранённые накладные в таблице выше или{" "}
              <Link to={archiveBase}>«Архив»</Link> для закрытых рейсов.
            </>
          }
        />
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
              className={btnClassSpaced}
              disabled={batchesQueryFetching}
              onClick={() => void refreshDistributionLists(queryClient)}
            >
              {batchesQueryFetching ? "Обновление…" : "Обновить список партий"}
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

      {viewingSaved ? (
            <div className="birzha-distribution-detail">
              <p className="no-print birzha-section-backlink">
                <Link to={distributionBase} style={{ fontWeight: 600 }}>
                  ← Новая погрузочная накладная
                </Link>
              </p>
              {viewingArchivedManifest ? (
                <InfoAlert title="Накладная в архиве">
                  Рейс по этой погрузочной закрыт — в рабочем списке «Погрузка на машину» она не показывается. Открыть все архивные
                  накладные: <Link to={archiveBase}>Архив</Link>.
                </InfoAlert>
              ) : null}
              {createManifestWarning ? (
                <WarningAlert title="Проверьте привязку рейса">{createManifestWarning}</WarningAlert>
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
                  assignTripId=""
                  setAssignTripId={() => undefined}
                  assignTrip={{ mutate: () => undefined, isPending: false, isError: false, error: null }}
                  trips={[]}
                  variant="view"
                  appendSectionPath={
                    !viewingArchivedManifest && canShip
                      ? `${appendBase}/${encodeURIComponent(openManifestSummary.id)}`
                      : undefined
                  }
                  tripSectionPath={
                    !viewingArchivedManifest
                      ? `${tripBase}/${encodeURIComponent(openManifestSummary.id)}`
                      : undefined
                  }
                />
              ) : routeDetailQuery.isPending ? (
                <LoadingBlock label="Загрузка погрузочной накладной…" minHeight={80} skeleton skeletonRows={3} />
              ) : manifestDetailNotFound ? (
                <BirzhaEmptyState
                  title="Погрузочная накладная удалена или не найдена"
                  description="Ссылка устарела или документ удалён в настройках."
                  action={
                    <Link to={distributionBase} className="birzha-clean-ops-text-btn">
                      ← К списку «Погрузка на машину»
                    </Link>
                  }
                />
              ) : routeDetailQuery.isError ? (
                <ErrorAlert
                  error={routeDetailQuery.error}
                  message="Не удалось открыть погрузочную накладную."
                  title="Погрузочная накладная"
                />
              ) : (
                <InfoAlert title="Накладная не найдена">
                  Проверьте ссылку или вернитесь к{" "}
                  <Link to={distributionBase}>списку погрузочных накладных</Link>.
                </InfoAlert>
              )}
            </div>
          ) : null}

      {manifestFormOpen && selectedWarehouse && !viewingSaved && canShip ? (
        <DistributionCreateForm
          appendMode={appendMode}
          appendTargetManifest={appendTargetManifest}
          onClose={() => setManifestFormOpen(false)}
          newManifestTripId={newManifestTripId}
          onNewManifestTripIdChange={(v) => {
            setNewManifestTripId(v);
            writePreferredLoadingTripId(v.trim() || null);
            const trip = openTripsForAssign.find((t) => t.id === v.trim());
            const tripDest = trip?.destinationCode?.trim() ?? "";
            if (tripDest && destAllowed.includes(tripDest)) {
              setManifestDestinationCode(tripDest);
              writePreferredLoadingDestinationCode(tripDest);
            }
          }}
          manifestDestinationCode={manifestDestinationCode}
          onManifestDestinationCodeChange={(v) => {
            const trip = openTripsForAssign.find((t) => t.id === newManifestTripId.trim());
            if (tripLocksManifestDestination(trip)) {
              return;
            }
            setManifestDestinationCode(v);
            writePreferredLoadingDestinationCode(v || null);
          }}
          manifestDate={manifestDate}
          onManifestDateChange={setManifestDate}
          destAllowed={destAllowed}
          labelDest={labelDest}
          openTripsForAssign={openTripsForAssign}
          tripsPending={tripsQuery.isPending}
          selectedWarehouse={selectedWarehouse}
          tableRows={tableRows}
          takenManifestNumbers={(manifestsListQuery.data?.loadingManifests ?? []).map((m) => m.manifestNumber)}
          createPending={createManifest.isPending}
          createError={createManifest.isError ? createManifest.error : null}
          tripsBase={tripsBase}
          onSave={(payload) => createManifest.mutate(payload)}
        />
      ) : null}
    </section>
  );
}
