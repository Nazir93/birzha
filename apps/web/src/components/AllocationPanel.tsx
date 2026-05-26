import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { BATCH_DESTINATIONS } from "@birzha/contracts";
import { apiPostJson } from "../api/fetch-api.js";
import type { BatchListItem, CreateLoadingManifestResponse, LoadingManifestSummary } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { closedTripIdSet, filterTripsInWork, splitLoadingManifestsByArchive } from "../format/archive.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import {
  estimatedPackageCountOnShelf,
  filterBatchesForLoadingManifest,
  formatLoadingManifestDisplayName,
  resolveLoadingManifestNumberForSave,
} from "../format/loading-manifest.js";
import { manifestsForWarehouseSorted } from "../format/loading-manifest-list.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
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
  const queryClient = useQueryClient();
  const [assignTripId, setAssignTripId] = useState("");

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
  const [manifestNumber, setManifestNumber] = useState("");
  const [manifestDestinationCode, setManifestDestinationCode] = useState<string>("");
  const [savedManifestId, setSavedManifestId] = useState<string>("");

  const activeManifestId = routeManifestId.trim() || savedManifestId;
  const viewingSaved = Boolean(routeManifestId.trim());

  const warehouseName = useCallback(
    (id: string) => {
      const w = warehousesQuery.data?.warehouses.find((x) => x.id === id);
      return w ? `${w.name} (${w.code})` : id;
    },
    [warehousesQuery.data?.warehouses],
  );

  const savedManifestQuery = useQuery({
    ...loadingManifestDetailQueryOptions(savedManifestId),
    enabled: Boolean(savedManifestId) && savedManifestId !== routeManifestId.trim(),
  });

  const manifestsListQuery = useQuery({
    ...loadingManifestsListQueryOptions(),
    enabled: Boolean(selectedWarehouse),
  });

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
  const activeManifests = useMemo(
    () => splitLoadingManifestsByArchive(manifestsListQuery.data?.loadingManifests ?? [], closedIds).active,
    [manifestsListQuery.data?.loadingManifests, closedIds],
  );

  const manifestsOnThisWarehouse = useMemo(
    () => manifestsForWarehouseSorted(activeManifests, selectedWarehouse),
    [activeManifests, selectedWarehouse],
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

  const createManifest = useMutation({
    mutationFn: async (payload: {
      warehouseId: string;
      destinationCode: string;
      batchIds: string[];
      docDate: string;
      manifestNumber: string;
    }) => {
      return apiPostJson("/api/loading-manifests", payload) as Promise<CreateLoadingManifestResponse>;
    },
    onSuccess: (res) => {
      setSavedManifestId(res.manifestId);
      setLoadNaklSelection(new Set());
      void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "list"] });
      void queryClient.invalidateQueries({ queryKey: [...queryRoots.loadingManifest, "reserved-batch-ids"] });
      void navigate(`${distributionBase}/${encodeURIComponent(res.manifestId)}`);
    },
  });

  const list = useMemo(
    () =>
      (batchesQuery.data?.batches ?? [])
        .filter((b) => b.onWarehouseKg > 0)
        .filter(isFromPurchaseNakladnaya)
        .filter((b) => !reservedBatchIdSet.has(b.id)),
    [batchesQuery.data?.batches, reservedBatchIdSet],
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

  useEffect(() => {
    if (selectedWarehouse !== "" || allocationWarehouseOptions.length === 0) {
      return;
    }
    const pref = readPreferredWarehouseId();
    if (pref && allocationWarehouseOptions.some((o) => o.id === pref)) {
      setSelectedWarehouse(pref);
    }
  }, [allocationWarehouseOptions, selectedWarehouse]);

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
    const fallback = inferredDestinationCode || destAllowed[0] || "";
    if (!fallback) {
      return;
    }
    if (!manifestDestinationCode || !destAllowed.includes(manifestDestinationCode)) {
      setManifestDestinationCode(fallback);
    }
  }, [destAllowed, inferredDestinationCode, manifestDestinationCode]);

  const rowsFingerprint = useMemo(() => tableRows.map((b) => b.id).sort().join("|"), [tableRows]);
  useEffect(() => {
    if (!viewingSaved) {
      setSavedManifestId("");
    }
  }, [selectedWarehouse, manifestDate, manifestNumber, manifestDestinationCode, rowsFingerprint, viewingSaved]);

  if (batchesQuery.isError) {
    return (
      <ErrorAlert message="Не удалось загрузить партии. Запустите API с PostgreSQL." title="Партии" />
    );
  }

  return (
    <div role="region" aria-label="Погрузка на машину">
      <h2 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>Погрузка на машину</h2>
      <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.85rem" }}>
        Выберите город, соберите партии со склада и сохраните погрузочную накладную для печати.
      </p>

      {warehousesQuery.isError ? (
        <WarningAlert title="Склады">Справочник складов не загрузился — подписи к складу могут быть неполны.</WarningAlert>
      ) : null}

      {loading && <LoadingBlock label="Загрузка партий…" minHeight={100} skeleton skeletonRows={6} />}

      <StaleDataNotice show={refetching} label="Обновление списка партий…" />
      <StaleDataNotice
        show={Boolean(selectedWarehouse) && reservedBatchIdsQuery.isFetching && !reservedBatchIdsQuery.isPending}
        label="Обновление учёта погрузочных накладных…"
      />

      {!loading && selectedWarehouse && reservedBatchIdsQuery.isError && (
        <p className="birzha-callout-warning" role="status">
          Не удалось загрузить список партий, уже внесённых в погрузочные накладные — отбор показывает полный остаток.
        </p>
      )}
      {!loading && list.length === 0 && (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length > 0 ? (
        <InfoAlert title="Нет партий для отбора">
          Остатки с оформленной <strong>закупкой товара</strong> здесь не найдены. Оформите приём в{" "}
          <Link to={purchaseNakladnayaBasePath}>Закупке товара</Link>.
        </InfoAlert>
      ) : null}
      {!loading &&
        list.length === 0 &&
        (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length === 0 && (
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

      {!loading && list.length > 0 && (
        <>
          <div style={{ marginBottom: "1rem", width: "100%", maxWidth: "100%" }}>
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
          </div>

          {viewingSaved && openManifestSummary ? (
            <div style={{ marginBottom: "1.1rem" }}>
              <p className="no-print" style={{ margin: "0 0 0.5rem" }}>
                <Link to={distributionBase} style={{ fontWeight: 600 }}>
                  ← Новая погрузочная накладная
                </Link>
              </p>
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
            </div>
          ) : null}

          {selectedWarehouse && !viewingSaved ? (
            <>
              <div
                className="birzha-callout-info"
                style={{ marginBottom: "1rem", padding: "0.85rem 1rem" }}
                role="region"
                aria-label="Новая погрузочная накладная"
              >
                <h3 style={{ margin: "0 0 0.65rem", fontSize: "1rem" }}>Новая погрузочная накладная</h3>
                <div className="birzha-form-grid">
                  <label>
                    Город / направление *
                    <select
                      value={manifestDestinationCode}
                      onChange={(e) => setManifestDestinationCode(e.target.value)}
                      style={fieldStyle}
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
                  <label>
                    Название накладной
                    <input
                      value={manifestNumber}
                      onChange={(e) => setManifestNumber(e.target.value)}
                      style={fieldStyle}
                      placeholder="Рейс, фура… (необязательно)"
                      autoComplete="off"
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                  <button
                    type="button"
                    style={btnStyle}
                    disabled={
                      createManifest.isPending ||
                      tableRows.length === 0 ||
                      !manifestDate ||
                      !manifestDestinationCode
                    }
                    onClick={() => {
                      const destLabel = labelDest[manifestDestinationCode] ?? manifestDestinationCode;
                      createManifest.mutate({
                        warehouseId: selectedWarehouse,
                        destinationCode: manifestDestinationCode,
                        batchIds: tableRows.map((b) => b.id),
                        docDate: manifestDate,
                        manifestNumber: resolveLoadingManifestNumberForSave(
                          manifestNumber,
                          destLabel,
                          manifestDate,
                        ),
                      });
                    }}
                  >
                    {createManifest.isPending ? "Сохранение…" : "Сохранить погрузочную накладную"}
                  </button>
                </div>
                {createManifest.isError ? (
                  <ErrorAlert
                    error={createManifest.error}
                    message="Не удалось сохранить. Проверьте город, дату и выбранные партии."
                    title="Сохранение"
                  />
                ) : null}
                {tableRows.length === 0 ? (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                    Отметьте накладные закупки ниже — в накладную попадут только выбранные партии.
                  </p>
                ) : (
                  <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.5rem 0 0" }}>
                    В накладную: <strong>{tableRows.length}</strong> парт.,{" "}
                    <strong>
                      {tableRows
                        .reduce((a, b) => a + b.onWarehouseKg, 0)
                        .toLocaleString("ru-RU", { maximumFractionDigits: 2 })}
                    </strong>{" "}
                    кг · {labelDest[manifestDestinationCode] ?? manifestDestinationCode}
                  </p>
                )}
              </div>

              <BirzhaDisclosure
                defaultOpen={tableRows.length > 0}
                title={<span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Отбор накладных закупки</span>}
              >
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
                />
              </BirzhaDisclosure>
            </>
          ) : null}

          {selectedWarehouse && (
            <BirzhaDisclosure
              defaultOpen={!viewingSaved}
              title={<span style={{ fontSize: "0.95rem", fontWeight: 600 }}>Сохранённые накладные на складе</span>}
            >
              {manifestsListQuery.isPending ? (
                <p className="birzha-text-muted" style={{ fontSize: "0.88rem", margin: 0 }}>
                  Загрузка списка…
                </p>
              ) : null}
              {manifestsListQuery.isError ? (
                <ErrorAlert message="Не удалось загрузить список погрузочных накладных." title="Список ПН" />
              ) : null}
              {manifestsOnThisWarehouse.length === 0 && !manifestsListQuery.isPending && !manifestsListQuery.isError ? (
                <BirzhaEmptyState compact title="Пока нет сохранённых накладных на этом складе" />
              ) : null}
              {manifestsOnThisWarehouse.length > 0 ? (
                <div className="birzha-table-scroll birzha-table-scroll--sticky-head">
                  <table style={{ ...tableStyle, minWidth: 640 }} aria-label="Погрузочные накладные по складу">
                    <thead>
                      <tr>
                        <th scope="col" style={thHead}>
                          Накладная
                        </th>
                        <th scope="col" style={thHead}>
                          Дата
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
                      {manifestsOnThisWarehouse.map((m) => {
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
                            <td style={thtd}>{m.docDate}</td>
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
              ) : null}
            </BirzhaDisclosure>
          )}
        </>
      )}
    </div>
  );
}
