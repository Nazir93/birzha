import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BATCH_DESTINATIONS } from "@birzha/contracts";
import { apiFetch } from "../api/fetch-api.js";
import type {
  BatchListItem,
  BatchesListResponse,
  ShipDestinationsListResponse,
  WarehousesListResponse,
} from "../api/types.js";
import { useAuth } from "../auth/auth-context.js";
import { saveDistributionShipPayload } from "../distribution/distribution-ship-payload.js";
import { formatBatchPartyCaption, formatShortBatchId } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { estimatedPackageCountOnShelf, filterBatchesForLoadingManifest } from "../format/loading-manifest.js";
import { ops, purchaseNakladnayaDocumentPath } from "../routes.js";
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

type RowEdit = { destination: string };

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
  const { meta } = useAuth();
  const showWarehouseWriteOff = meta?.warehouseWriteOffApi === "enabled";
  const queryClient = useQueryClient();
  const shipDestQ = useQuery({
    queryKey: ["ship-destinations"],
    queryFn: async () => {
      const res = await apiFetch("/api/ship-destinations");
      if (!res.ok) {
        throw new Error(`ship-destinations ${res.status}`);
      }
      return res.json() as Promise<ShipDestinationsListResponse>;
    },
    enabled: meta?.shipDestinationsApi === "enabled",
    retry: 1,
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
  /** Партии для «Применить к выбранным» (направление). */
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [bulkDestination, setBulkDestination] = useState<string>("_notset");
  const [rejectScrapInput, setRejectScrapInput] = useState<Record<string, string>>({});

  const warehouseName = useCallback(
    (id: string) => {
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
      destination: toSelectValue(a?.destination ?? null, destAllowed, "not_set"),
    };
  };

  const save = useMutation({
    mutationFn: async ({ batchId, destination }: { batchId: string; destination: string }) => {
      const body = { destination: (destination === "_notset" ? null : destination) as string | null };
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

  const writeOff = useMutation({
    mutationFn: async ({ batchId, kg }: { batchId: string; kg: number }) => {
      const res = await apiFetch(`/api/batches/${encodeURIComponent(batchId)}/warehouse-write-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "quality_reject", kg }),
      });
      if (res.status === 503) {
        throw new Error("Нужна PostgreSQL (списание на складе не настроено).");
      }
      if (res.status === 409) {
        const t = await res.json().catch(() => ({}));
        const msg = typeof t === "object" && t && "message" in t ? String(t.message) : "Недостаточно кг на остатке";
        throw new Error(msg);
      }
      if (res.status === 403) {
        throw new Error("Недостаточно прав (роль закупки/склада/руководства).");
      }
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
    },
    onSuccess: (_d, { batchId }) => {
      setRejectScrapInput((prev) => {
        const next = { ...prev };
        delete next[batchId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const bulkSave = useMutation({
    mutationFn: async (payload: { batchIds: string[]; destination: string }) => {
      const hasD = payload.destination !== "_notset";
      if (!hasD) {
        return;
      }
      for (const batchId of payload.batchIds) {
        const res = await apiFetch(`/api/batches/${encodeURIComponent(batchId)}/allocation`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(hasD
              ? { destination: payload.destination === "_notset" ? null : (payload.destination as string) }
              : {}),
          }),
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
      }
    },
    onSuccess: () => {
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const onSaveRow = (b: BatchListItem) => {
    const e = getEdit(b);
    save.mutate({ batchId: b.id, destination: e.destination });
  };

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

  const onToggleSelectRow = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  }, []);
  const onClearRowSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const tableRows: BatchListItem[] = useMemo(() => {
    if (!selectedWarehouse) {
      return [];
    }
    if (documentOptions.length === 0) {
      return batchesInWh;
    }
    if (loadNaklSelection.size === 0) {
      return [];
    }
    return filterBatchesForLoadingManifest(batchesInWh, documentOptions.length, loadNaklSelection);
  }, [batchesInWh, documentOptions.length, loadNaklSelection, selectedWarehouse]);

  const onSelectAllTableRows = useCallback(() => {
    setSelectedRowIds(new Set(tableRows.map((b) => b.id)));
  }, [tableRows]);

  useEffect(() => {
    const valid = new Set(tableRows.map((b) => b.id));
    setSelectedRowIds((prev) => new Set([...prev].filter((id) => valid.has(id))));
  }, [tableRows]);

  if (batchesQuery.isError) {
    return (
      <p role="alert" style={errorText}>
        Не удалось загрузить партии. Запустите API с PostgreSQL для распределения.
      </p>
    );
  }

  return (
    <div role="region" aria-label="Распределение по направлению">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Распределение по направлению</h2>
      <p style={muted}>
        <strong>Здесь только приём в учёте</strong> (сорт, направление, брак кг, печатный «лист погрузки»). <strong>Факта
        отгрузки в фуру</strong> здесь нет — она в разделе{" "}
        <Link to={ops.operations} style={{ fontWeight: 600 }}>
          Операции
        </Link>
        , после кнопки <strong>«Погрузка в рейс»</strong> (она переносит список партий, вы выбираете рейс и
        подтверждаете).
      </p>
      <p style={muted}>
        <strong>1</strong> — склад. <strong>2</strong> — накладные, откуда везёте в этот рейс, свод по калибру/партиям.{" "}
        <strong>3</strong> — таблица: чекбоксами отметьте партии для <strong>массового</strong> назначения направления («К выбранным»)
        <strong> и/или</strong> чтобы ограничить, <strong>какие</strong> партии попадут в «Погрузка в рейс» (если
        <strong>ничего</strong> не отмечено — в рейс пойдут <strong>все</strong> строки отбора). Брак в кг — в колонке. См.{" "}
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

      {!loading && list.length === 0 && (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length > 0 && (
        <p style={warnText} role="status">
          Остатки с оформленной <strong>накладной</strong> (id документа и склад в строке) здесь не найдены — на отбор не
          попадут «ручные»/старые партии без накладной. Оформите приём в{" "}
          <Link to={ops.purchaseNakladnaya}>Накладной</Link>.
        </p>
      )}
      {!loading &&
        list.length === 0 &&
        (batchesQuery.data?.batches ?? []).filter((b) => b.onWarehouseKg > 0).length === 0 && (
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
                  {whSummary.docCount > 0 ? <>{whSummary.docCount} накладн.</> : "накладная в данных не указана"}
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
            <LoadingManifestBlock
              documentOptions={manifestDocumentOptions}
              selectedDocIds={loadNaklSelection}
              onToggleNaklDoc={onToggleNaklDoc}
              onSelectAllNakl={onSelectAllNakl}
              onClearNakl={onClearNakl}
              batchesInWh={batchesInWh}
              warehouseName={warehouseName(selectedWarehouse)}
            />
          )}

          {selectedWarehouse && documentOptions.length === 0 && batchesInWh.length > 0 && (
            <p style={{ ...muted, fontSize: "0.9rem", marginBottom: "1rem" }} role="status">
              На выбранном складе нет привязки к номеру накладной в ответе API — показаны все партии с остатком на этом
              складе. Оформите закупку в{" "}
              <Link to={ops.purchaseNakladnaya}>Накладной</Link>.
            </p>
          )}

          {selectedWarehouse && documentOptions.length > 0 && loadNaklSelection.size === 0 && (
            <p style={warnText}>Отметьте в блоке выше хотя бы одну накладную — иначе не к чему проставлять сорт в таблице.</p>
          )}

          {selectedWarehouse &&
            (documentOptions.length === 0 || (documentOptions.length > 0 && loadNaklSelection.size > 0)) &&
            tableRows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
                <h3 id="alloc-table" style={{ fontSize: "0.98rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                2. Направление и отбор в рейс (по чекбоксам)
              </h3>
              {tableRows.length > 0 && (
                <div
                  className="no-print"
                  style={{ margin: "0 0 0.9rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", alignItems: "end" }}
                >
                  <span style={{ fontSize: "0.86rem" }} title="Те же чекбоксы используются для кнопки «Погрузка в рейс» (если 0 — берутся все строки)">
                    Отмечено партий: <strong>{selectedRowIds.size}</strong> / {tableRows.length}
                  </span>
                  <div>
                    <span style={muted}>Направление</span>{" "}
                    <select
                      aria-label="Направление для выбранных"
                      value={bulkDestination}
                      onChange={(ev) => setBulkDestination(ev.target.value)}
                      style={fieldStyle}
                    >
                      <option value="_notset">— пропуск —</option>
                      {destAllowed.map((c) => (
                        <option key={c} value={c}>
                          {labelDest[c] ?? c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      type="button"
                      style={btnStyle}
                      disabled={bulkSave.isPending || save.isPending || selectedRowIds.size === 0}
                      onClick={() => {
                        if (bulkDestination === "_notset") {
                          return;
                        }
                        const batchIds = [...selectedRowIds];
                        bulkSave.mutate({ batchIds, destination: bulkDestination });
                      }}
                    >
                      {bulkSave.isPending ? "…" : "К выбранным"}
                    </button>
                    <button type="button" style={btnStyle} onClick={onSelectAllTableRows} disabled={tableRows.length === 0}>
                      Все строки
                    </button>
                    <button type="button" style={btnStyle} onClick={onClearRowSelection}>
                      Сброс
                    </button>
                  </div>
                </div>
              )}
              <table style={tableStyle} aria-labelledby="alloc-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ ...thHead, width: "2.5rem" }}>
                      <input
                        type="checkbox"
                        title="Переключить все"
                        checked={
                          tableRows.length > 0 && tableRows.every((b) => selectedRowIds.has(b.id))
                        }
                        onChange={(ev) => (ev.target.checked ? onSelectAllTableRows() : onClearRowSelection())}
                        aria-label="Переключить выбор всех партий"
                      />
                    </th>
                    <th scope="col" style={thHead}>
                      Партия
                    </th>
                    <th scope="col" style={thHead}>
                      Остаток, кг
                    </th>
                    <th scope="col" style={thHead}>
                      Ящики
                    </th>
                    {showWarehouseWriteOff && (
                      <th scope="col" style={thHead}>
                        Брак (кг) со склада
                      </th>
                    )}
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
                          <input
                            type="checkbox"
                            checked={selectedRowIds.has(b.id)}
                            onChange={() => onToggleSelectRow(b.id)}
                            aria-label={`Партия ${label}: сорт/направление пачкой и/или в список «Погрузка в рейс»`}
                          />
                        </td>
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
                        {showWarehouseWriteOff && (
                          <td style={thtd}>
                            <div style={{ fontSize: "0.82rem", marginBottom: "0.35rem" }}>
                              уже:{" "}
                              <strong>
                                {typeof b.qualityRejectWrittenOffKg === "number"
                                  ? b.qualityRejectWrittenOffKg.toLocaleString("ru-RU", {
                                      maximumFractionDigits: 2,
                                    })
                                  : "0"}{" "}
                                кг
                              </strong>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="кг"
                                value={rejectScrapInput[b.id] ?? ""}
                                onChange={(ev) =>
                                  setRejectScrapInput((prev) => ({ ...prev, [b.id]: ev.target.value }))
                                }
                                style={{ ...fieldStyle, width: "4.2rem" }}
                                aria-label="Килограммов брака к списанию"
                              />
                              <button
                                type="button"
                                style={btnStyle}
                                disabled={writeOff.isPending}
                                onClick={() => {
                                  const s = (rejectScrapInput[b.id] ?? "").replace(",", ".");
                                  const kg = parseFloat(s);
                                  if (!Number.isFinite(kg) || kg <= 0) {
                                    return;
                                  }
                                  if (kg > b.onWarehouseKg) {
                                    return;
                                  }
                                  writeOff.mutate({ batchId: b.id, kg });
                                }}
                              >
                                Списать
                              </button>
                            </div>
                            {b.allocation?.qualityTier === "reject" && (
                              <p style={{ ...muted, fontSize: "0.75rem", margin: "0.3rem 0 0" }}>
                                В БД: вся партия помечена «брак»; приведите в соответствие или снимайте
                                в админ-данных.
                              </p>
                            )}
                          </td>
                        )}
                        <td style={thtd}>
                          <select
                            aria-label="Направление"
                            value={e.destination}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setEdits((prev) => ({ ...prev, [b.id]: { ...e, destination: v } }));
                              // Город/направление сохраняем сразу, чтобы при повторном входе не "сбрасывалось".
                              save.mutate({ batchId: b.id, destination: v });
                            }}
                            style={fieldStyle}
                          >
                            <option value="_notset">— не выбрано —</option>
                            {destAllowed.map((c) => (
                              <option key={c} value={c}>
                                {labelDest[c] ?? c}
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
                    const idsFromSelection =
                      selectedRowIds.size > 0
                        ? tableRows.filter((b) => selectedRowIds.has(b.id)).map((b) => b.id)
                        : tableRows.map((b) => b.id);
                    if (idsFromSelection.length === 0) {
                      return;
                    }
                    saveDistributionShipPayload({ v: 1, batchIds: idsFromSelection });
                    void navigate({ pathname: ops.operations, search: "?fromDistribution=1" });
                  }}
                >
                  Погрузка в рейс
                </button>{" "}
                <span style={muted}>
                  Переход в <strong>Операции</strong> со списком:{" "}
                  {selectedRowIds.size > 0 ? (
                    <>только <strong>отмеченные</strong> партии ({selectedRowIds.size})</>
                  ) : (
                    <>
                      <strong>все</strong> партии в таблице (ничего не отмечали)
                    </>
                  )}
                  . Там — выбор <strong>рейса</strong> и одна кнопка <strong>отгрузить весь</strong> этот список. Это
                  <strong> не</strong> повтор: здесь — учёт и печать, в Операциях — движение в рейс.
                </span>
              </p>
              <p style={{ ...muted, fontSize: "0.82rem", marginTop: "0.35rem" }}>
                Направление в строке сохраняется <strong>сразу при выборе</strong> (без отдельной кнопки).
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

      {save.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.75rem" }}>
          {(save.error as Error).message}
        </p>
      )}
      {writeOff.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.35rem" }}>
          {(writeOff.error as Error).message}
        </p>
      )}
      {bulkSave.isError && (
        <p role="alert" style={{ ...errorText, marginTop: "0.35rem" }}>
          {(bulkSave.error as Error).message}
        </p>
      )}
    </div>
  );
}
