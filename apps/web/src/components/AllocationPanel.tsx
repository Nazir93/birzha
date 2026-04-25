import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BATCH_DESTINATIONS, BATCH_QUALITY_TIERS } from "@birzha/contracts";
import { apiFetch } from "../api/fetch-api.js";
import type { BatchListItem, BatchesListResponse, WarehousesListResponse } from "../api/types.js";
import { saveDistributionShipPayload } from "../distribution/distribution-ship-payload.js";
import { formatBatchPartyCaption, formatShortBatchId } from "../format/batch-label.js";
import { estimatedPackageCountOnShelf, filterBatchesForLoadingManifest } from "../format/loading-manifest.js";
import { ops, purchaseNakladnayaDocumentPath } from "../routes.js";
import { LoadingManifestBlock, type LoadingManifestDocOption } from "./LoadingManifestBlock.js";
import { LoadingBlock, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { btnStyle, errorText, fieldStyle, muted, tableStyle, thHead, thtd, warnText } from "../ui/styles.js";

const ORPHAN_WAREHOUSE = "__unassigned__";

const labelsQuality: Record<(typeof BATCH_QUALITY_TIERS)[number], string> = {
  standard: "стандарт (для регионов и «нормальной» реализации)",
  weak: "слабый (уценка, отдельный контур)",
  reject: "брак (не в продажу)",
};

const labelsDestination: Record<(typeof BATCH_DESTINATIONS)[number], string> = {
  moscow: "Москва",
  regions: "Регионы",
  discount: "Уценка / распродажа",
  writeoff: "Списание",
};

type RowEdit = { quality: string; destination: string };

function toSelectValue(
  v: string | null | undefined,
  allowed: readonly string[],
  emptyLabel: "empty" | "not_set",
): string {
  if (v && allowed.includes(v)) {
    return v;
  }
  return emptyLabel === "not_set" ? "_notset" : "";
}

/** Группировка остатков: склад (из накладной) → партии. Без накладной / без склада — отдельный бакет. */
function groupBatchesByWarehouse(stock: BatchListItem[]): {
  byWarehouse: Map<string, BatchListItem[]>;
  order: string[];
} {
  const byWarehouse = new Map<string, BatchListItem[]>();
  for (const b of stock) {
    const wid = b.nakladnaya?.warehouseId?.trim() || null;
    const key = wid ?? ORPHAN_WAREHOUSE;
    if (!byWarehouse.has(key)) {
      byWarehouse.set(key, []);
    }
    byWarehouse.get(key)!.push(b);
  }
  const order = [...byWarehouse.keys()].sort((a, b) => {
    if (a === ORPHAN_WAREHOUSE) {
      return 1;
    }
    if (b === ORPHAN_WAREHOUSE) {
      return -1;
    }
    return a.localeCompare(b, "ru");
  });
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
  const queryClient = useQueryClient();
  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: async () => {
      const res = await apiFetch("/api/batches");
      if (!res.ok) {
        throw new Error(`batches ${res.status}`);
      }
      return res.json() as Promise<BatchesListResponse>;
    },
    retry: 1,
  });

  const warehousesQuery = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await apiFetch("/api/warehouses");
      if (!res.ok) {
        throw new Error(`warehouses ${res.status}`);
      }
      return res.json() as Promise<WarehousesListResponse>;
    },
    retry: 1,
  });

  const [edits, setEdits] = useState<Record<string, RowEdit | undefined>>({});
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  /** Какие накл. вошли в «отбор под рейс» — общий список для сбора на погрузку и для строк качества. */
  const [loadNaklSelection, setLoadNaklSelection] = useState<Set<string>>(() => new Set());

  const warehouseName = useCallback(
    (id: string) => {
      if (id === ORPHAN_WAREHOUSE) {
        return "Прочие (без накладной / вручную)";
      }
      const w = warehousesQuery.data?.warehouses.find((x) => x.id === id);
      return w ? `${w.name} (${w.code})` : id;
    },
    [warehousesQuery.data?.warehouses],
  );

  const getEdit = (b: BatchListItem): RowEdit => {
    const e = edits[b.id];
    if (e) {
      return e;
    }
    const a = b.allocation;
    return {
      quality: toSelectValue(a?.qualityTier ?? null, BATCH_QUALITY_TIERS, "not_set"),
      destination: toSelectValue(a?.destination ?? null, BATCH_DESTINATIONS, "not_set"),
    };
  };

  const save = useMutation({
    mutationFn: async ({ batchId, quality, destination }: { batchId: string; quality: string; destination: string }) => {
      const body = {
        qualityTier: (quality === "_notset" ? null : quality) as string | null,
        destination: (destination === "_notset" ? null : destination) as string | null,
      };
      const res = await apiFetch(`/api/batches/${encodeURIComponent(batchId)}/allocation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 503) {
        throw new Error("Нужна PostgreSQL на сервере (распределение не доступно in-memory).");
      }
      if (res.status === 403) {
        throw new Error("Недостаточно прав (нужна роль закупки/склада/руководства).");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
    },
    onSuccess: (_d, { batchId }) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[batchId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const onSaveRow = (b: BatchListItem) => {
    const e = getEdit(b);
    save.mutate({ batchId: b.id, quality: e.quality, destination: e.destination });
  };

  const list = useMemo(
    () => (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0),
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
      if (id === ORPHAN_WAREHOUSE) {
        continue;
      }
      if (cat.some((w) => w.id === id)) {
        continue;
      }
      add(id);
    }
    if (byWarehouse.has(ORPHAN_WAREHOUSE)) {
      const orphanB = byWarehouse.get(ORPHAN_WAREHOUSE) ?? [];
      if (orphanB.length > 0) {
        add(ORPHAN_WAREHOUSE);
      }
    }
    return out;
  }, [warehousesQuery.data?.warehouses, byWarehouse, warehouseOrder]);

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
    if (selectedWarehouse === ORPHAN_WAREHOUSE) {
      return batchesInWh;
    }
    if (documentOptions.length === 0) {
      return batchesInWh;
    }
    if (loadNaklSelection.size === 0) {
      return [];
    }
    return filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, loadNaklSelection);
  }, [batchesInWh, documentOptions.length, loadNaklSelection, selectedWarehouse]);

  if (batchesQuery.isError) {
    return (
      <p role="alert" style={errorText}>
        Не удалось загрузить партии. Запустите API с PostgreSQL для распределения.
      </p>
    );
  }

  return (
    <div role="region" aria-label="Распределение по качеству и направлению">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Распределение по качеству и направлению</h2>
      <p style={muted}>
        Весь товар, принятый по <strong>разным</strong> накладным на один <strong>склад</strong>, даёт <strong>общий остаток</strong> в
        кг. <strong>1</strong> — выберите склад, <strong>2</strong> — в блоке ниже отметьте, с каких накладных берёте
        погрузку, посмотрите <strong>свод по калибру</strong> и <strong>по партиям</strong> (снимите накл., что не везёте —
        товар <strong>остаётся</strong> на учёте склада), <strong>3</strong> — по <strong>тем же</strong> партиям укажите
        качество и направление. <strong>Оформить рейс / отгрузку</strong> — в{" "}
        <Link to={ops.operations} style={{ fontWeight: 600 }}>
          Операциях
        </Link>{" "}
        (кнопка внизу). Расхождения кг/приём — правки в «Операциях»; при необходимости в карточке исходной накл. См.{" "}
        <Link to={ops.reports}>отчёты</Link>.
      </p>
      <p style={{ ...warnText, fontSize: "0.86rem" }}>
        Требуется <strong>PostgreSQL</strong>: <code>PATCH /api/batches/…/allocation</code> без БД на сервере не выполняется.
      </p>

      {warehousesQuery.isError && (
        <p style={warnText} role="alert">
          Справочник складов (GET /api/warehouses) не загружен — подписи к складу могут быть неполны.
        </p>
      )}

      {loading && <LoadingBlock label="Загрузка партий (GET /api/batches)…" minHeight={100} />}

      <StaleDataNotice show={refetching} label="Обновление списка партий…" />

      {!loading && list.length === 0 && (
        <p style={muted}>
          Нет партий с остатком на складе — сначала оформите закупку по накладной (вкладка{" "}
          <Link to={ops.purchaseNakladnaya}>Накладная</Link>).
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
                setSelectedWarehouse(e.target.value);
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
                  {whSummary.docCount > 0 ? (
                    <>{whSummary.docCount} накладн.</>
                  ) : (
                    <>
                      {selectedWarehouse === ORPHAN_WAREHOUSE
                        ? "без привязки к накладной"
                        : "накладная в данных не указана"}
                    </>
                  )}
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
                {selectedWarehouse === ORPHAN_WAREHOUSE && (
                  <p style={{ margin: "0.35rem 0 0" }}>
                    Склад не подтянут из накладной — проверьте приём; иначе остатки сходятся в «Прочие».
                  </p>
                )}
              </div>
            )}
            {warehousesQuery.isSuccess &&
              (warehousesQuery.data?.warehouses.length ?? 0) > 0 &&
              !warehousesQuery.isPending &&
              warehouseOrder.length === 1 &&
              warehouseOrder[0] === ORPHAN_WAREHOUSE &&
              list.length > 0 && (
                <p style={warnText} role="status">
                  Все остатки попали в «{warehouseName(ORPHAN_WAREHOUSE)}» — в ответе GET /batches нет
                  <code> nakladnaya.warehouseId</code> (и с колонки партии). Обновите API: склад подставляется с приёмов и
                  накладных.
                </p>
              )}
          </div>

          {selectedWarehouse && (
            <LoadingManifestBlock
              selectedWarehouse={selectedWarehouse}
              documentOptions={manifestDocumentOptions}
              selectedDocIds={loadNaklSelection}
              onToggleNaklDoc={onToggleNaklDoc}
              onSelectAllNakl={onSelectAllNakl}
              onClearNakl={onClearNakl}
              batchesInWh={batchesInWh}
              warehouseName={warehouseName(selectedWarehouse)}
            />
          )}

          {selectedWarehouse && selectedWarehouse !== ORPHAN_WAREHOUSE && documentOptions.length === 0 && batchesInWh.length > 0 && (
            <p style={{ ...muted, fontSize: "0.9rem", marginBottom: "1rem" }} role="status">
              На выбранном складе нет привязки к номеру накладной в ответе API — показаны все партии с остатком на этом
              складе. Обычно накладная указывается при приёме; при необходимости проверьте данные в{" "}
              <Link to={ops.purchaseNakladnaya}>Накладная</Link>.
            </p>
          )}

          {selectedWarehouse === ORPHAN_WAREHOUSE && (
            <p style={{ ...muted, fontSize: "0.9rem", marginBottom: "1rem" }}>
              Партии без привязки к строке накладной: распределение по калибру (строка таблицы = партия).
            </p>
          )}

          {selectedWarehouse &&
            selectedWarehouse !== ORPHAN_WAREHOUSE &&
            documentOptions.length > 0 &&
            loadNaklSelection.size === 0 && <p style={warnText}>Отметьте в блоке выше хотя бы одну накладную — иначе не к чему проставлять сорт в таблице.</p>}

          {selectedWarehouse &&
            (selectedWarehouse === ORPHAN_WAREHOUSE ||
              documentOptions.length === 0 ||
              (documentOptions.length > 0 && loadNaklSelection.size > 0)) &&
            tableRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <h3 id="alloc-table" style={{ fontSize: "0.98rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                2. Качество и направление по отобранным партиям
              </h3>
              <table style={tableStyle} aria-labelledby="alloc-table">
                <thead>
                  <tr>
                    <th scope="col" style={thHead}>
                      Партия
                    </th>
                    <th scope="col" style={thHead}>
                      Остаток, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Ящики
                    </th>
                    <th scope="col" style={thHead}>
                      Качество
                    </th>
                    <th scope="col" style={thHead}>
                      Направление
                    </th>
                    <th scope="col" style={thHead} />
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((b) => {
                    const label = formatBatchPartyCaption(b, b.id);
                    const e = getEdit(b);
                    const onShelfPkg = estimatedPackageCountOnShelf(b);
                    const linePkg = b.nakladnaya?.linePackageCount;
                    return (
                      <tr key={b.id}>
                        <td style={thtd}>
                          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</div>
                          {b.nakladnaya?.documentId && (
                            <Link
                              to={purchaseNakladnayaDocumentPath(b.nakladnaya.documentId)}
                              style={{ fontSize: "0.82rem" }}
                            >
                              накладная
                            </Link>
                          )}
                          <div>
                            <code style={{ fontSize: "0.75rem", color: "#71717a" }}>{formatShortBatchId(b.id)}</code>
                          </div>
                        </td>
                        <td style={thtd}>{b.onWarehouseKg}</td>
                        <td style={thtd}>
                          {onShelfPkg != null ? (
                            <span style={{ fontWeight: 500 }}>≈ {onShelfPkg}</span>
                          ) : (
                            "—"
                          )}
                          {linePkg != null && linePkg > 0 && (
                            <div style={{ fontSize: "0.78rem", color: "#52525b", marginTop: "0.2rem" }}>
                              в накл.: {linePkg} шт. · вес партии {b.totalKg} кг
                            </div>
                          )}
                        </td>
                        <td style={thtd}>
                          <select
                            aria-label="Качество"
                            value={e.quality}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setEdits((prev) => ({ ...prev, [b.id]: { ...e, quality: v } }));
                            }}
                            style={fieldStyle}
                          >
                            <option value="_notset">— не выбрано —</option>
                            {BATCH_QUALITY_TIERS.map((c) => (
                              <option key={c} value={c}>
                                {labelsQuality[c]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={thtd}>
                          <select
                            aria-label="Направление"
                            value={e.destination}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setEdits((prev) => ({ ...prev, [b.id]: { ...e, destination: v } }));
                            }}
                            style={fieldStyle}
                          >
                            <option value="_notset">— не выбрано —</option>
                            {BATCH_DESTINATIONS.map((c) => (
                              <option key={c} value={c}>
                                {labelsDestination[c]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={thtd}>
                          <button type="button" style={btnStyle} disabled={save.isPending} onClick={() => onSaveRow(b)}>
                            {save.isPending ? "…" : "Сохранить"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="no-print" style={{ marginTop: "0.9rem" }}>
                <button
                  type="button"
                  style={btnStyle}
                  onClick={() => {
                    saveDistributionShipPayload({ v: 1, batchIds: tableRows.map((b) => b.id) });
                    void navigate({ pathname: ops.operations, search: "?fromDistribution=1" });
                  }}
                >
                  Погрузка в рейс
                </button>{" "}
                <span style={muted}>
                  (переносит этот набор партий в «Операции» — укажите рейс и нажмите «Отгрузить весь отбор из
                  «Распределения»»; рейс при отсутствии создаётся на той же странице)
                </span>
              </p>
            </div>
          )}

          {selectedWarehouse &&
            tableRows.length === 0 &&
            loadNaklSelection.size > 0 &&
            selectedWarehouse !== ORPHAN_WAREHOUSE && (
            <p style={muted} role="status">
              По отмеченным накладным нет партий с остатком / всё в рейсах — смотрите в Операциях.
            </p>
          )}
        </>
      )}

      {save.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}
