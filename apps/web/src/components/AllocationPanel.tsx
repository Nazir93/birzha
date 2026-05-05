import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { BATCH_DESTINATIONS } from "@birzha/contracts";
import { apiPostJson, postBatchWarehouseWriteOffQualityReject } from "../api/fetch-api.js";
import type { BatchListItem, CreateLoadingManifestResponse } from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { saveDistributionShipPayload } from "../distribution/distribution-ship-payload.js";
import { formatNakladLineLabel } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { estimatedPackageCountOnShelf, filterBatchesForLoadingManifest } from "../format/loading-manifest.js";
import { readPreferredWarehouseId, writePreferredWarehouseId } from "../preferences/ops-preferred-warehouse.js";
import {
  batchesFullListQueryOptions,
  loadingManifestDetailQueryOptions,
  queryRoots,
  shipDestinationsFullListQueryOptions,
  warehousesFullListQueryOptions,
} from "../query/core-list-queries.js";
import {
  adminAwarePathForPath,
  adminRoutes,
  ops,
  purchaseNakladnayaBasePathForPath,
  purchaseNakladnayaDocumentPathForPath,
} from "../routes.js";
import { BirzhaDateField } from "./BirzhaCalendarFields.js";
import { LoadingManifestBlock, type LoadingManifestDocOption } from "./LoadingManifestBlock.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, muted, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";

/** «Брак» по всей партии в списке не проставляем — только частичное кг-списание. */

const labelsDestination: Record<(typeof BATCH_DESTINATIONS)[number], string> = {
  moscow: "Москва",
  regions: "Регионы",
  discount: "Уценка / распродажа",
  writeoff: "Списание",
};

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultManifestNumber(): string {
  const d = new Date();
  return `ПН-${d.toISOString().slice(0, 10).replaceAll("-", "")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Группировка: склад из строки накладной. В `stock` только партии `isFromPurchaseNakladnaya`. */
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

/** Список накладных на складе: подписи чекбоксов; при одинаковом номере у разных id — дизамбиг в подписи. */
function documentOptionsForAllocation(
  batches: BatchListItem[],
): { id: string; number: string; checkboxLabel: string }[] {
  const m = new Map<string, string>();
  for (const b of batches) {
    const d = b.nakladnaya?.documentId;
    if (d) {
      m.set(d, b.nakladnaya?.documentNumber?.trim() || d);
    }
  }
  const base = [...m.entries()]
    .map(([id, number]) => ({ id, number }))
    .sort((a, b) => a.number.localeCompare(b.number, "ru"));
  const byNumberCount = new Map<string, number>();
  for (const o of base) {
    byNumberCount.set(o.number, (byNumberCount.get(o.number) ?? 0) + 1);
  }
  return base.map((o) => ({
    id: o.id,
    number: o.number,
    checkboxLabel:
      (byNumberCount.get(o.number) ?? 0) > 1
        ? `№ ${o.number} (id ${o.id.slice(0, 6)}…)`
        : `№ ${o.number}`,
  }));
}

function sumOnWarehouseKg(batches: BatchListItem[]): number {
  return batches.reduce((a, b) => a + b.onWarehouseKg, 0);
}

function countNakldocuments(batches: BatchListItem[]): number {
  const s = new Set<string>();
  for (const b of batches) {
    const d = b.nakladnaya?.documentId;
    if (d) s.add(d);
  }
  return s.size;
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { meta } = useAuth();
  const purchaseNakladnayaBasePath = purchaseNakladnayaBasePathForPath(pathname);
  const operationsPath = adminAwarePathForPath(pathname, adminRoutes.operations, ops.operations);
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

  const batchesQuery = useQuery(batchesFullListQueryOptions());

  const warehousesQuery = useQuery(warehousesFullListQueryOptions());

  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  /** Какие накл. вошли в «отбор под рейс» — общий список для сбора на погрузку и для строк качества. */
  const [loadNaklSelection, setLoadNaklSelection] = useState<Set<string>>(() => new Set());
  const [manifestDate, setManifestDate] = useState(todayDateOnly);
  const [manifestNumber, setManifestNumber] = useState(defaultManifestNumber);
  const [manifestDestinationCode, setManifestDestinationCode] = useState<string>("");
  const [savedManifestId, setSavedManifestId] = useState<string>("");
  const [rejectScrapInput, setRejectScrapInput] = useState<Record<string, string>>({});

  const warehouseName = useCallback(
    (id: string) => {
      const w = warehousesQuery.data?.warehouses.find((x) => x.id === id);
      return w ? `${w.name} (${w.code})` : id;
    },
    [warehousesQuery.data?.warehouses],
  );

  const savedManifestQuery = useQuery({
    ...loadingManifestDetailQueryOptions(savedManifestId),
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
      void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
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
      setSavedManifestId("");
      void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    },
  });

  const list = useMemo(
    () =>
      (batchesQuery.data?.batches ?? [])
        .filter((b) => b.onWarehouseKg > 0)
        .filter(isFromPurchaseNakladnaya),
    [batchesQuery.data?.batches],
  );
  const loading = batchesQuery.isPending;
  const refetching = batchesQuery.isFetching && !batchesQuery.isPending;

  const { byWarehouse, order: warehouseOrder } = useMemo(() => groupBatchesByWarehouse(list), [list]);

  /** Склады из справочника (всегда в селекте) + остатки/кг по партиям, без «потери» физического склада. */
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

  const whSummary = useMemo(() => {
    if (!selectedWarehouse) {
      return null;
    }
    const bs = byWarehouse.get(selectedWarehouse) ?? [];
    const totalKg = sumOnWarehouseKg(bs);
    const ndoc = countNakldocuments(bs);
    const { sum: packageEstimate, linesWithBoxData } = sumPackageEstimatesForWarehouse(bs);
    return { batches: bs.length, totalKg, docCount: ndoc, packageEstimate, linesWithBoxData };
  }, [byWarehouse, selectedWarehouse]);

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
      /** Все строки с остатком на складе — без фильтра по накладным (как «все накладные»). */
      return filterBatchesForLoadingManifest(batchesInWh, 0, new Set());
    }
    return filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, loadNaklSelection);
  }, [batchesInWh, documentOptions.length, loadNaklSelection, selectedWarehouse]);

  const writeOffRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        lineLabel: string;
        totalKg: number;
        totalPkg: number;
        linesWithPkg: number;
        partCount: number;
        batches: BatchListItem[];
      }
    >();
    for (const batch of tableRows) {
      const lineLabel = formatNakladLineLabel(batch);
      if (!grouped.has(lineLabel)) {
        grouped.set(lineLabel, {
          lineLabel,
          totalKg: 0,
          totalPkg: 0,
          linesWithPkg: 0,
          partCount: 0,
          batches: [],
        });
      }
      const row = grouped.get(lineLabel)!;
      row.totalKg += batch.onWarehouseKg;
      row.partCount += 1;
      row.batches.push(batch);
      const pkg = estimatedPackageCountOnShelf(batch);
      if (pkg != null) {
        row.totalPkg += pkg;
        row.linesWithPkg += 1;
      }
    }
    return [...grouped.values()].sort((a, b) => a.lineLabel.localeCompare(b.lineLabel, "ru"));
  }, [tableRows]);

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
    setSavedManifestId("");
  }, [selectedWarehouse, manifestDate, manifestNumber, manifestDestinationCode, rowsFingerprint]);

  /** Партии с остатком по накладным, которые сознательно не отмечены в отборе — чтобы видеть складской хвост. */
  const batchesOutsideNaklSelection = useMemo(() => {
    if (!selectedWarehouse || documentOptions.length === 0 || loadNaklSelection.size === 0) {
      return [] as BatchListItem[];
    }
    return batchesInWh.filter((b) => {
      if (b.onWarehouseKg <= 0) {
        return false;
      }
      const docId = b.nakladnaya?.documentId;
      if (!docId) {
        return false;
      }
      return !loadNaklSelection.has(docId);
    });
  }, [batchesInWh, documentOptions.length, loadNaklSelection, selectedWarehouse]);

  if (batchesQuery.isError) {
    return (
      <p role="alert" style={errorText}>
        Не удалось загрузить партии. Запустите API с PostgreSQL для распределения.
      </p>
    );
  }

  return (
    <div role="region" aria-label="Распределение товара">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Распределение товара</h2>
      <p style={muted}>Выберите склад, уберите лишние накладные, задайте город и сформируйте погрузочную накладную.</p>
      <p style={{ ...warnText, fontSize: "0.86rem" }}>
        Требуется постоянная база данных: без неё распределение на сервере не сохраняется.
      </p>

      {warehousesQuery.isError && (
        <p style={warnText} role="alert">
          Справочник складов не загрузился — подписи к складу могут быть неполны.
        </p>
      )}

      {loading && <LoadingBlock label="Загрузка партий…" minHeight={100} />}

      <StaleDataNotice show={refetching} label="Обновление списка партий…" />

      {!loading && list.length === 0 && (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length > 0 && (
        <p style={warnText} role="status">
          Остатки с оформленной <strong>закупкой товара</strong> (id документа и склад в строке) здесь не найдены — на отбор не
          попадут «ручные»/старые партии без накладной. Оформите приём в{" "}
          <Link to={purchaseNakladnayaBasePath}>Закупке товара</Link>.
        </p>
      )}
      {!loading &&
        list.length === 0 &&
        (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length === 0 && (
        <p style={muted}>
          Нет партий с остатком на складе — сначала оформите закупку товара (раздел{" "}
          <Link to={purchaseNakladnayaBasePath}>Закупка товара</Link>).
        </p>
      )}

      {!loading && list.length > 0 && (
        <>
          <div style={{ marginBottom: "1rem", width: "100%", maxWidth: "100%" }}>
            <label htmlFor="alloc-sel-warehouse" style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.35rem" }}>
              1. Склад (куда сходятся остатки с приёмов по накладным) *
            </label>
            <select
              id="alloc-sel-warehouse"
              value={selectedWarehouse}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedWarehouse(v);
                writePreferredWarehouseId(v === "" ? null : v);
              }}
              style={{ ...fieldStyle, maxWidth: "100%" }}
            >
              <option value="">— выберите склад —</option>
              {allocationWarehouseOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {warehouseName(row.id)} — {row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг
                  {row.linesWithBoxData > 0
                    ? `, ≈ ${row.packageEstimate.toLocaleString("ru-RU")} ящ.`
                    : ""}
                  {`, ${row.batchCount} парт.`}
                </option>
              ))}
            </select>
            {selectedWarehouse && whSummary && (
              <div
                style={{ ...muted, margin: "0.5rem 0 0", fontSize: "0.88rem", lineHeight: 1.45 }}
                role="status"
                aria-live="polite"
              >
                <p style={{ margin: "0 0 0.35rem" }}>
                  <strong>Остаток на этом складе:</strong>{" "}
                  {whSummary.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг &nbsp;·&nbsp;{" "}
                  {whSummary.batches} парт. &nbsp;·&nbsp;{" "}
                  {whSummary.docCount > 0 ? <>{whSummary.docCount} закуп.</> : "закупка товара в данных не указана"}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Ящики (оценка):</strong>{" "}
                  {whSummary.linesWithBoxData > 0 ? (
                    <>
                      ≈ {whSummary.packageEstimate.toLocaleString("ru-RU")} шт. на остатке (по {whSummary.linesWithBoxData}{" "}
                      {whSummary.linesWithBoxData === 1 ? "строке" : "строкам"} с числом ящиков в накладной; пропорция к кг
                      остатка)
                    </>
                  ) : (
                    <>в строках накладных не указаны — смотрите только кг в таблице</>
                  )}
                </p>
              </div>
            )}
          </div>

          {selectedWarehouse && (
            <>
              <div className="birzha-inline-panel" style={{ marginBottom: "0.9rem" }}>
                <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.55rem" }}>Данные погрузочной накладной</h3>
                <div className="birzha-form-grid">
                  <label>
                    Дата *
                    <BirzhaDateField
                      value={manifestDate}
                      onChange={setManifestDate}
                      style={fieldStyle}
                    />
                  </label>
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
                    Номер *
                    <input
                      value={manifestNumber}
                      onChange={(e) => setManifestNumber(e.target.value)}
                      style={fieldStyle}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.7rem" }}>
                  <button
                    type="button"
                    style={btnStyle}
                    disabled={
                      createManifest.isPending ||
                      tableRows.length === 0 ||
                      !manifestDate ||
                      !manifestNumber.trim() ||
                      !manifestDestinationCode
                    }
                    onClick={() => {
                      createManifest.mutate({
                        warehouseId: selectedWarehouse,
                        destinationCode: manifestDestinationCode,
                        batchIds: tableRows.map((b) => b.id),
                        docDate: manifestDate,
                        manifestNumber: manifestNumber.trim(),
                      });
                    }}
                  >
                    {createManifest.isPending ? "Сохранение…" : "Сохранить погрузочную накладную"}
                  </button>
                  {savedManifestId && (
                    <button type="button" style={btnStyle} onClick={() => window.print()}>
                      Печать
                    </button>
                  )}
                </div>
                {createManifest.isError && (
                  <p style={errorText} role="alert">
                    Не удалось сохранить погрузочную накладную. Проверьте дату, город и выбранные партии.
                  </p>
                )}
                {savedManifestId && (
                  <p style={{ ...muted, marginBottom: 0 }} role="status">
                    Сохранено: № {savedManifestQuery.data?.manifest.manifestNumber ?? manifestNumber}.
                  </p>
                )}
              </div>
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
            </>
          )}

          {selectedWarehouse && tableRows.length > 0 && meta?.warehouseWriteOffApi === "enabled" && (
            <div className="birzha-inline-panel" style={{ marginTop: "0.9rem" }}>
              <h3 style={{ fontSize: "0.92rem", fontWeight: 600, margin: "0 0 0.4rem" }}>Списать со склада (брак)</h3>
              <p style={{ ...muted, fontSize: "0.83rem", marginTop: 0 }}>
                Если строка не должна ехать в рейс, можно списать нужный вес со склада.
              </p>
              <div className="birzha-table-scroll">
                <table style={{ ...tableStyle, fontSize: "0.88rem", minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={thHead}>Калибр / строка</th>
                      <th style={thHead}>Остаток, кг</th>
                      <th style={thHead}>Списать, кг</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeOffRows.map((row) => (
                      <tr key={`wo-${row.lineLabel}`}>
                        <td style={thtd}>
                          <strong>{row.lineLabel}</strong>
                          <span className="birzha-text-muted" style={{ marginLeft: 6, fontSize: "0.78rem" }}>
                            {row.partCount} парт.
                          </span>
                        </td>
                        <td style={thtd}>{row.totalKg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</td>
                        <td style={thtd}>
                          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="кг"
                              value={rejectScrapInput[row.lineLabel] ?? ""}
                              onChange={(ev) =>
                                setRejectScrapInput((prev) => ({ ...prev, [row.lineLabel]: ev.target.value }))
                              }
                              style={{ ...fieldStyle, width: "5rem" }}
                            />
                            <button
                              type="button"
                              style={btnStyle}
                              disabled={writeOff.isPending}
                              onClick={() => {
                                const s = (rejectScrapInput[row.lineLabel] ?? "").replace(",", ".");
                                const kg = parseFloat(s);
                                if (!Number.isFinite(kg) || kg <= 0 || kg > row.totalKg) {
                                  return;
                                }
                                let remaining = kg;
                                const items: { batchId: string; kg: number }[] = [];
                                for (const batch of row.batches) {
                                  if (remaining <= 0) {
                                    break;
                                  }
                                  const kgFromBatch = Math.min(remaining, batch.onWarehouseKg);
                                  if (kgFromBatch > 0) {
                                    items.push({ batchId: batch.id, kg: kgFromBatch });
                                    remaining -= kgFromBatch;
                                  }
                                }
                                if (items.length > 0) {
                                  writeOff.mutate({ inputKey: row.lineLabel, items });
                                }
                              }}
                            >
                              Списать
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedWarehouse && batchesOutsideNaklSelection.length > 0 && (
            <div className="birzha-inline-panel" role="region" aria-label="Остаток по неотмеченным накладным">
              <h3 style={{ fontSize: "0.92rem", fontWeight: 600, margin: "0 0 0.4rem" }}>
                Не вошло в отбор накладных — остаток на складе
              </h3>
              <p style={{ ...muted, fontSize: "0.82rem", margin: "0 0 0.5rem", lineHeight: 1.45 }}>
                Ниже партии по документам, которые вы <strong>сняли</strong> с галочек выше; на склад они по-прежнему
                числятся — видно кг и калибр.
              </p>
              <div className="birzha-table-scroll">
                <table style={{ ...tableStyle, fontSize: "0.88rem", minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th scope="col" style={thHead}>
                        Накладная
                      </th>
                      <th scope="col" style={thHead}>
                        Калибр / строка
                      </th>
                      <th scope="col" style={thHead}>
                        Остаток, кг
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchesOutsideNaklSelection.map((b) => (
                      <tr key={b.id}>
                        <td style={thtd}>
                          {b.nakladnaya?.documentNumber ? (
                            <>
                              № {b.nakladnaya.documentNumber}
                              {b.nakladnaya.documentId && (
                                <>
                                  {" "}
                                  <Link
                                    to={purchaseNakladnayaDocumentPathForPath(pathname, b.nakladnaya.documentId)}
                                    style={{ fontSize: "0.82rem" }}
                                  >
                                    открыть
                                  </Link>
                                </>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={thtd}>{formatNakladLineLabel(b)}</td>
                        <td style={thtd}>{b.onWarehouseKg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedWarehouse && documentOptions.length === 0 && batchesInWh.length > 0 && (
            <p style={{ ...muted, fontSize: "0.9rem", marginBottom: "1rem" }} role="status">
              На выбранном складе нет привязки к номеру накладной в ответе API — показаны все партии с остатком на этом
              складе. Оформите закупку в{" "}
              <Link to={purchaseNakladnayaBasePath}>Закупке товара</Link>.
            </p>
          )}

          {selectedWarehouse && documentOptions.length > 0 && loadNaklSelection.size === 0 && (
            <p style={{ ...muted, fontSize: "0.88rem", marginBottom: "0.75rem" }} role="status">
              <strong>Накладные не отфильтрованы</strong> — в таблице ниже показан <strong>полный остаток</strong> на этом
              складе. Отметьте накладные в блоке выше, чтобы сузить список только к выбранным документам.
            </p>
          )}

          {selectedWarehouse && tableRows.length > 0 && (
            <div>
              <p className="no-print" style={{ marginTop: "0.9rem" }}>
                <button
                  type="button"
                  style={btnStyle}
                  disabled={!savedManifestId}
                  onClick={() => {
                    const idsFromSelection = tableRows.map((b) => b.id);
                    if (idsFromSelection.length === 0) {
                      return;
                    }
                    saveDistributionShipPayload({ v: 1, batchIds: idsFromSelection, manifestId: savedManifestId });
                    void navigate({ pathname: operationsPath, search: "?fromDistribution=1" });
                  }}
                >
                  Отправить накладную в рейс
                </button>{" "}
                <span style={muted}>
                  Сформируйте погрузочную накладную, затем выберите рейс в Операциях.
                </span>
              </p>
            </div>
          )}

          {selectedWarehouse && tableRows.length === 0 && loadNaklSelection.size > 0 && (
            <p style={muted} role="status">
              По отмеченным накладным нет партий с остатком / всё в рейсах — смотрите в Операциях.
            </p>
          )}
        </>
      )}

      {writeOff.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.6rem" }}>
          {(writeOff.error as Error).message}
        </p>
      )}

    </div>
  );
}
