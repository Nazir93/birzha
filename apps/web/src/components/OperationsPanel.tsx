import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiFetch } from "../api/fetch-api.js";
import {
  clearDistributionShipPayload,
  readDistributionShipPayload,
} from "../distribution/distribution-ship-payload.js";
import type {
  BatchListItem,
  BatchesListResponse,
  CounterpartiesListResponse,
  ShipmentReportResponse,
  TripsListResponse,
} from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { isFromPurchaseNakladnaya } from "../format/is-from-purchase-nakladnaya.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { distributeIntegersProRata } from "../format/distribute-integers-pro-rata.js";
import {
  buildTripBatchRows,
  estimateNetTransitPackageCount,
  type TripBatchTableRow,
} from "../format/trip-report-rows.js";
import { useAuth } from "../auth/auth-context.js";
import {
  btnStyle,
  errorText,
  fieldStyle,
  muted,
  successText,
  warnText,
} from "../ui/styles.js";
import { LoadingBlock, LoadingIndicator, StaleDataNotice } from "../ui/LoadingIndicator.js";
import { canManageInventoryCatalog } from "../auth/role-panels.js";
import { adminRoutes, ops, purchaseNakladnayaDocumentPath } from "../routes.js";
import { BatchesByNakladnayaReference, groupBatchesByPurchaseDocument } from "./BatchesByNakladnayaReference.js";
import { parseRecordTripShortageForm, parseSellFromTripForm, parseShipForm } from "../validation/api-schemas.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

/** Граммы → строка кг для подписей (целые граммы → десятичные кг без float). */
function gramsBigIntToKgDecimalString(g: bigint): string {
  if (g === 0n) {
    return "0";
  }
  const negative = g < 0n;
  const v = negative ? -g : g;
  const whole = v / 1000n;
  const rem = v % 1000n;
  if (rem === 0n) {
    return `${negative ? "-" : ""}${whole}`;
  }
  const frac = rem.toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Подпись партии в форме отгрузки: накладная + товар/калибр + остаток на складе. */
function formatBatchShipLabel(b: BatchListItem): string {
  const kg = b.onWarehouseKg;
  const nn = b.nakladnaya?.documentNumber?.trim();
  const line = formatNakladLineLabel(b);
  if (nn && line !== "—") {
    return `№ ${nn} · ${line} — ${kg} кг на складе`;
  }
  if (line !== "—") {
    return `${line} — ${kg} кг на складе`;
  }
  return `Партия ${formatShortBatchId(b.id)} — ${kg} кг на складе`;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

function useTripsOptions() {
  const q = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const res = await apiFetch("/api/trips");
      if (!res.ok) {
        throw new Error(`trips ${res.status}`);
      }
      return res.json() as Promise<TripsListResponse>;
    },
    retry: 1,
  });
  const options = (q.data?.trips ?? []).slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
  return { ...q, options };
}

function ErrorText({ e }: { e: Error | null }) {
  if (!e) {
    return null;
  }
  return (
    <p role="alert" style={errorText}>
      {e.message}
    </p>
  );
}

export function OperationsPanel() {
  const { meta, user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: ["shipment-report"] });
    void queryClient.invalidateQueries({ queryKey: ["batches"] });
  };

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

  const trips = useTripsOptions();

  const shippableBatches = useMemo(() => {
    const list = batchesQuery.data?.batches ?? [];
    return list
      .filter((b) => b.onWarehouseKg > 0)
      .filter(isFromPurchaseNakladnaya)
      .sort((a, b) => {
      const na = a.nakladnaya?.documentNumber ?? "";
      const nb = b.nakladnaya?.documentNumber ?? "";
      if (na !== nb) {
        return na.localeCompare(nb, "ru");
      }
      const ga = a.nakladnaya?.productGradeCode ?? "";
      const gb = b.nakladnaya?.productGradeCode ?? "";
      if (ga !== gb) {
        return ga.localeCompare(gb, "ru");
      }
      return a.id.localeCompare(b.id);
    });
  }, [batchesQuery.data?.batches]);

  const [distShipBatchIds, setDistShipBatchIds] = useState<string[] | null>(null);

  const distBatchesToShip = useMemo(() => {
    if (distShipBatchIds == null || distShipBatchIds.length === 0) {
      return [] as BatchListItem[];
    }
    const want = new Set(distShipBatchIds);
    return shippableBatches
      .filter((b) => want.has(b.id))
      .slice()
      .sort((a, b) => {
        const g = (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru");
        if (g !== 0) {
          return g;
        }
        return a.id.localeCompare(b.id);
      });
  }, [distShipBatchIds, shippableBatches]);

  const distBatchesMissingCount = useMemo(
    () =>
      distShipBatchIds == null || distShipBatchIds.length === 0
        ? 0
        : distShipBatchIds.length - distBatchesToShip.length,
    [distShipBatchIds, distBatchesToShip.length],
  );
  const distByCaliberSummary = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of distBatchesToShip) {
      const label = formatNakladLineLabel(b);
      m.set(label, (m.get(label) ?? 0) + b.onWarehouseKg);
    }
    return [...m.entries()]
      .sort((a, c) => a[0].localeCompare(c[0], "ru"))
      .map(([line, kg]) => ({ line, kg }));
  }, [distBatchesToShip]);
  const hasDistributionSelection = (distShipBatchIds?.length ?? 0) > 0;

  const fromDistributionQ = searchParams.get("fromDistribution");
  useEffect(() => {
    if (fromDistributionQ !== "1") {
      return;
    }
    const p = readDistributionShipPayload();
    if (p && p.batchIds.length > 0) {
      setDistShipBatchIds(p.batchIds);
    }
    void navigate({ pathname: location.pathname, search: "" }, { replace: true });
  }, [fromDistributionQ, location.pathname, navigate]);

  useLayoutEffect(() => {
    if (distShipBatchIds == null || distShipBatchIds.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById("op-sec-ship")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [distShipBatchIds]);

  const batchesGroupedCount = useMemo(
    () => groupBatchesByPurchaseDocument(batchesQuery.data?.batches).length,
    [batchesQuery.data?.batches],
  );

  const nakladOptionsForShipAll = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of shippableBatches) {
      const docId = b.nakladnaya?.documentId;
      const num = b.nakladnaya?.documentNumber;
      if (docId && num) {
        seen.set(docId, num);
      }
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], "ru"))
      .map(([documentId, documentNumber]) => ({ documentId, documentNumber }));
  }, [shippableBatches]);

  const counterpartiesCatalog = meta?.counterpartyCatalogApi === "enabled";
  const counterpartiesQ = useQuery({
    queryKey: ["counterparties"],
    queryFn: async () => {
      const res = await apiFetch("/api/counterparties");
      if (!res.ok) {
        throw new Error(`counterparties ${res.status}`);
      }
      return res.json() as Promise<CounterpartiesListResponse>;
    },
    enabled: counterpartiesCatalog,
    retry: 1,
  });

  const [shipBatchId, setShipBatchId] = useState("");
  const [shipTripId, setShipTripId] = useState("");
  const [shipKg, setShipKg] = useState("");
  const [shipPackages, setShipPackages] = useState("");
  const [shipAllDocumentId, setShipAllDocumentId] = useState("");
  /** Всего ящиков в отгрузке «вся накладная»; распределяются по строкам пропорционально кг. */
  const [shipAllTotalPackages, setShipAllTotalPackages] = useState("");

  const ship = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseShipForm(shipBatchId, shipTripId, shipKg, shipPackages);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  const shipAllFromNaklad = useMutation({
    mutationFn: async () => {
      const tripT = shipTripId.trim();
      if (!tripT) {
        throw new Error("Выберите рейс");
      }
      if (!shipAllDocumentId) {
        throw new Error("Выберите накладную");
      }
      const rows = shippableBatches
        .filter((b) => b.nakladnaya?.documentId === shipAllDocumentId)
        .slice()
        .sort((a, b) => {
          const g = (a.nakladnaya?.productGradeCode ?? "").localeCompare(b.nakladnaya?.productGradeCode ?? "", "ru");
          if (g !== 0) {
            return g;
          }
          return a.id.localeCompare(b.id);
        });
      if (rows.length === 0) {
        throw new Error("Нет остатка на складе по строкам этой накладной");
      }
      const pkgRaw = shipAllTotalPackages.trim();
      let perLinePackages: number[] | null = null;
      if (pkgRaw !== "") {
        const totalPk = Number.parseInt(pkgRaw, 10);
        if (!Number.isFinite(totalPk) || totalPk < 0) {
          throw new Error("Ящики (всего): целое неотрицательное число или пусто");
        }
        const w = rows.map((b) => b.onWarehouseKg);
        perLinePackages = distributeIntegersProRata(w, totalPk);
      }
      for (let i = 0; i < rows.length; i++) {
        const b = rows[i]!;
        const pkgStr =
          perLinePackages === null
            ? ""
            : (perLinePackages[i] ?? 0) > 0
              ? String(perLinePackages[i])
              : "";
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), pkgStr);
        await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      invalidateDomain();
      setShipAllDocumentId("");
      setShipAllTotalPackages("");
    },
  });

  const shipFromDistribution = useMutation({
    mutationFn: async () => {
      const tripT = shipTripId.trim();
      if (!tripT) {
        throw new Error("Выберите рейс");
      }
      if (distBatchesToShip.length === 0) {
        throw new Error("Нет партий с остатком по этому отбору");
      }
      for (const b of distBatchesToShip) {
        const { batchId, body } = parseShipForm(b.id, tripT, String(b.onWarehouseKg), "");
        await postJson(`/api/batches/${encodeURIComponent(batchId)}/ship-to-trip`, body);
      }
    },
    onSuccess: () => {
      invalidateDomain();
      setDistShipBatchIds(null);
      clearDistributionShipPayload();
    },
  });

  const [sellBatchId, setSellBatchId] = useState("");
  const [sellTripId, setSellTripId] = useState("");
  const [sellKg, setSellKg] = useState("");
  const [saleId, setSaleId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [paymentKind, setPaymentKind] = useState<"cash" | "debt" | "mixed">("cash");
  const [cashMixed, setCashMixed] = useState("");
  const [sellClientLabel, setSellClientLabel] = useState("");
  const [sellCounterpartyId, setSellCounterpartyId] = useState("");
  const [newCounterpartyName, setNewCounterpartyName] = useState("");

  const sellTripIdTrim = sellTripId.trim();
  const sellReportQuery = useQuery({
    queryKey: ["shipment-report", sellTripIdTrim],
    queryFn: async () => {
      const res = await apiFetch(`/api/trips/${encodeURIComponent(sellTripIdTrim)}/shipment-report`);
      if (!res.ok) {
        throw new Error(`Отчёт рейса ${res.status}`);
      }
      return res.json() as Promise<ShipmentReportResponse>;
    },
    enabled: sellTripIdTrim.length > 0,
    retry: 1,
  });

  const batchByIdForSell = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesQuery.data?.batches]);

  const sellableOnTripRows = useMemo(() => {
    if (!sellReportQuery.data) {
      return [] as TripBatchTableRow[];
    }
    return buildTripBatchRows(sellReportQuery.data).filter((r) => r.netTransitG > 0n);
  }, [sellReportQuery.data]);

  const formatSellBatchOptionLabel = (row: TripBatchTableRow, opts?: { includeNakladPrefix?: boolean }): string => {
    const includeNakladPrefix = opts?.includeNakladPrefix !== false;
    const b = batchByIdForSell.get(row.batchId);
    const line = b ? formatNakladLineLabel(b) : `Партия ${formatShortBatchId(row.batchId)}`;
    const docNum = b?.nakladnaya?.documentNumber?.trim();
    const prefix = includeNakladPrefix && docNum ? `№ ${docNum} · ` : "";
    const kg = gramsBigIntToKgDecimalString(row.netTransitG);
    const estPkg = estimateNetTransitPackageCount(row);
    if (row.shippedPackages > 0n && estPkg > 0n) {
      return `${prefix}${line} — ${kg} кг · ≈${estPkg} ящ в пути`;
    }
    if (row.shippedPackages > 0n && row.netTransitG > 0n && estPkg === 0n) {
      return `${prefix}${line} — ${kg} кг · <1 ящ в пути (оцен.)`;
    }
    if (row.shippedG > 0n && row.shippedPackages === 0n) {
      return `${prefix}${line} — ${kg} кг (ящ: нет в отчёте — введите при отгрузке в рейс)`;
    }
    return `${prefix}${line} — ${kg} кг`;
  };

  /** Группы для селекта продажи: одна «накладная» — один optgroup, внутри строки по калибрам. */
  const sellTripRowsByNaklad = useMemo(() => {
    type Group = { key: string; optgroupLabel: string; sortKey: string; rows: TripBatchTableRow[] };
    const m = new Map<string, Group>();
    for (const row of sellableOnTripRows) {
      const b = batchByIdForSell.get(row.batchId);
      const docId = b?.nakladnaya?.documentId?.trim() ?? "";
      const docNum = b?.nakladnaya?.documentNumber?.trim() ?? "";
      const key = docId || "__no_naklad";
      if (!m.has(key)) {
        const optgroupLabel = docNum
          ? `Накладная № ${docNum}`
          : docId
            ? `Накладная (id ${docId.slice(0, 8)}…)`
            : "Без привязки к накладной в данных";
        m.set(key, {
          key,
          optgroupLabel,
          sortKey: docNum || docId || key,
          rows: [],
        });
      }
      m.get(key)!.rows.push(row);
    }
    const groups = [...m.values()]
      .map((g) => ({
        ...g,
        rows: g.rows.slice().sort((a, c) => {
          const ba = batchByIdForSell.get(a.batchId);
          const bc = batchByIdForSell.get(c.batchId);
          const la = ba ? formatNakladLineLabel(ba) : a.batchId;
          const lc = bc ? formatNakladLineLabel(bc) : c.batchId;
          const cmp = la.localeCompare(lc, "ru");
          if (cmp !== 0) {
            return cmp;
          }
          return a.batchId.localeCompare(c.batchId);
        }),
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "ru"));
    return groups;
  }, [sellableOnTripRows, batchByIdForSell]);

  const sellSelectionSummary = useMemo((): {
    line: string;
    doc: string;
    kg: string;
    estPkg: bigint;
    hasShipped: boolean;
    hasPkgData: boolean;
    /** Есть ящики в отчёте, но оценка в пути &lt; 1 целого ящика. */
    subUnitPackages: boolean;
  } | null => {
    if (!sellBatchId) {
      return null;
    }
    const row = sellableOnTripRows.find((r) => r.batchId === sellBatchId);
    if (!row) {
      return null;
    }
    const b = batchByIdForSell.get(row.batchId);
    const estPkg = estimateNetTransitPackageCount(row);
    return {
      line: b ? formatNakladLineLabel(b) : "—",
      doc: b?.nakladnaya?.documentNumber?.trim() ?? "—",
      kg: gramsBigIntToKgDecimalString(row.netTransitG),
      estPkg,
      hasShipped: row.shippedG > 0n,
      hasPkgData: row.shippedPackages > 0n,
      subUnitPackages: row.shippedPackages > 0n && row.netTransitG > 0n && estPkg === 0n,
    };
  }, [sellBatchId, sellableOnTripRows, batchByIdForSell]);

  const createCounterparty = useMutation({
    mutationFn: async () => {
      const displayName = newCounterpartyName.trim();
      if (!displayName) {
        throw new Error("Укажите название контрагента");
      }
      const j = await postJson("/api/counterparties", { displayName });
      return j as { counterparty: { id: string; displayName: string } };
    },
    onSuccess: async (data) => {
      setNewCounterpartyName("");
      setSellCounterpartyId(data.counterparty.id);
      await queryClient.invalidateQueries({ queryKey: ["counterparties"] });
    },
  });

  const sell = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseSellFromTripForm({
        batchId: sellBatchId,
        tripId: sellTripId,
        kg: sellKg,
        saleId,
        pricePerKg: sellPrice,
        paymentKind,
        cashMixed,
        clientLabel: sellClientLabel,
        counterpartyId: sellCounterpartyId || undefined,
      });
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/sell-from-trip`, body);
      return { saleId: body.saleId };
    },
    onSuccess: () => invalidateDomain(),
  });

  const [shortBatchId, setShortBatchId] = useState("");
  const [shortTripId, setShortTripId] = useState("");
  const [shortKg, setShortKg] = useState("");
  const [shortReason, setShortReason] = useState("");

  const shortage = useMutation({
    mutationFn: async () => {
      const { batchId, body } = parseRecordTripShortageForm(shortBatchId, shortTripId, shortKg, shortReason);
      await postJson(`/api/batches/${encodeURIComponent(batchId)}/record-trip-shortage`, body);
    },
    onSuccess: () => invalidateDomain(),
  });

  return (
    <div role="region" aria-label="Операции по партиям и рейсу">
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Операции по партиям и рейсу</h2>
      <p style={muted}>
        <strong>Порядок:</strong> партии создаются только из{" "}
        <Link to={ops.purchaseNakladnaya} style={{ fontWeight: 600 }}>
          накладной
        </Link>{" "}
        (строка = калибр = партия, товар сразу на складе). Здесь — рейс: отгрузка в рейс (<strong>кг</strong> обязательно;
        <strong>ящики</strong> при отгрузке — по желанию, дополнительно к накладной), при необходимости недостача по приёмке
        на рынке, продажа с рейса.
      </p>

      {batchesQuery.data && (
        <datalist id="batch-suggestions">
          {batchesQuery.data.batches
            .filter(isFromPurchaseNakladnaya)
            .map((b) => (
            <option key={b.id} value={b.id} />
          ))}
        </datalist>
      )}

      {batchesQuery.isError && <p style={warnText}>Список партий (GET /api/batches) не загрузился.</p>}
      <StaleDataNotice
        show={batchesQuery.isFetching && !batchesQuery.isPending}
        label="Обновление списка партий…"
      />
      {batchesQuery.isPending && <LoadingBlock label="Загрузка партий и остатков (GET /api/batches)…" minHeight={96} />}

      {!batchesQuery.isPending && batchesQuery.data && (
        <>
          <BatchesByNakladnayaReference
            batches={batchesQuery.data.batches}
            isLoading={false}
            sectionHeadingId="op-batches-heading"
            showBulkExpandControls={false}
          />
          {batchesGroupedCount > 0 && user && canManageInventoryCatalog(user) && (
            <p style={{ ...muted, fontSize: "0.86rem", margin: "-0.35rem 0 0.9rem" }}>
              Подробная <strong>справочная</strong> сводка с «развернуть все» — в кабинете{" "}
              <Link to={`${adminRoutes.inventory}#batches-nakl-ref`} style={{ fontWeight: 600 }}>
                Склады и калибры
              </Link>{" "}
              (с кнопками «развернуть/свернуть все»).
            </p>
          )}
        </>
      )}

      {trips.isError && (
        <p style={warnText}>Список рейсов не загрузился — выберите tripId вручную.</p>
      )}

      {counterpartiesCatalog && counterpartiesQ.isError && (
        <p style={warnText}>Справочник контрагентов (GET /api/counterparties) не загрузился.</p>
      )}
      {counterpartiesCatalog && counterpartiesQ.isPending && (
        <p style={{ margin: "0.25rem 0 0.5rem" }} role="status" aria-live="polite">
          <LoadingIndicator size="sm" label="Загрузка справочника контрагентов…" />
        </p>
      )}

      <section className="birzha-panel" aria-labelledby="op-sec-ship">
        <h3 id="op-sec-ship" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          1. Отгрузить в рейс
        </h3>
        <p style={muted}>
          {hasDistributionSelection ? (
            <>
              Вы пришли из <strong>Распределения</strong>: ниже отгружается <strong>один собранный отбор</strong> (свод по
              калибрам). Ручные блоки «Одна партия» и «Вся накладная» скрыты, чтобы не дублировать сценарий.
            </>
          ) : (
            <>
              POST /api/batches/:batchId/ship-to-trip — снимает массу <strong>с выбранной партии</strong> (строки накладной,
              калибр). Сначала выберите рейс, затем либо одну партию и кг, либо отгрузите все строки накладной, где есть
              остаток на складе.
            </>
          )}
        </p>
        <label htmlFor="op-sel-ship-trip" style={{ fontSize: "0.88rem" }}>
          Рейс (tripId) *
        </label>
        {trips.isPending && (
          <p style={{ margin: "0.15rem 0 0.35rem" }} role="status" aria-live="polite">
            <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
          </p>
        )}
        <select
          id="op-sel-ship-trip"
          value={shipTripId}
          onChange={(e) => setShipTripId(e.target.value)}
          style={{ ...selectWide, marginBottom: "0.75rem" }}
          disabled={trips.isPending}
          aria-busy={trips.isPending || undefined}
        >
          <option value="">{trips.isPending ? "— загрузка —" : "— выберите рейс —"}</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {formatTripSelectLabel(t)}
            </option>
          ))}
        </select>

        {!hasDistributionSelection && (
          <>
            <h4 style={{ margin: "0 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Одна партия (накладная · калибр)</h4>
        <label htmlFor="op-sel-ship-batch" style={{ fontSize: "0.88rem" }}>
          Партия *
        </label>
        <select
          id="op-sel-ship-batch"
          value={shipBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setShipBatchId(id);
            const b = batchesQuery.data?.batches.find((x) => x.id === id);
            if (b && b.onWarehouseKg > 0) {
              setShipKg(String(b.onWarehouseKg));
            }
          }}
          style={selectWide}
          disabled={batchesQuery.isPending}
          aria-busy={batchesQuery.isPending || undefined}
        >
          <option value="">{batchesQuery.isPending ? "— загрузка партий —" : "— выберите партию —"}</option>
          {shippableBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {formatBatchShipLabel(b)}
            </option>
          ))}
        </select>
        {shippableBatches.length === 0 && batchesQuery.data && (
          <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.85rem" }}>
            Нет партий с остатком на складе — нечего отгружать (сначала оформите приём по накладной на вкладке{" "}
            <Link to={ops.purchaseNakladnaya}>Накладная</Link>).
          </p>
        )}
        <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.82rem" }}>
          В выпадающем списке — только партии с остатком на складе. Ниже можно ввести или вставить batchId из таблицы
          выше (в т.ч. если нужна партия не из списка).
        </p>
        <label htmlFor="op-in-ship-batch-id" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.35rem" }}>
          batchId (дублирует выбор выше)
        </label>
        <input
          id="op-in-ship-batch-id"
          value={shipBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setShipBatchId(id);
            const b = batchesQuery.data?.batches.find((x) => x.id === id);
            if (b && b.onWarehouseKg > 0) {
              setShipKg(String(b.onWarehouseKg));
            }
          }}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
          placeholder="или вставьте UUID партии"
        />
        <label htmlFor="op-in-ship-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          kg *
        </label>
        <input
          id="op-in-ship-kg"
          value={shipKg}
          onChange={(e) => setShipKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-ship-pkg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          Ящики (опц., целое число)
        </label>
        <input
          id="op-in-ship-pkg"
          value={shipPackages}
          onChange={(e) => setShipPackages(e.target.value)}
          style={fieldStyle}
          inputMode="numeric"
          autoComplete="off"
          placeholder="пусто = не указано"
        />
        <button
          type="button"
          style={{ ...btnStyle, marginTop: "0.35rem" }}
          disabled={ship.isPending}
          aria-busy={ship.isPending || undefined}
          onClick={() => ship.mutate()}
        >
          {ship.isPending ? "…" : "Отгрузить"}
        </button>
        <ErrorText e={ship.error as Error | null} />
        {ship.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}

        <h4 style={{ margin: "1rem 0 0.35rem", fontSize: "0.92rem", fontWeight: 600 }}>Вся накладная в рейс</h4>
        <p style={{ ...muted, fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          Отправка <strong>по накладной</strong> в выбранный рейс: по очереди фиксируется отгрузка по каждой строке (калибр),{" "}
          <strong>кг</strong> = полный остаток на складе по строке. Можно указать <strong>всего ящиков по накладной</strong> в
          этой отгрузке — они <strong>распределяются по строкам пропорционально кг</strong> (сумма в отчёте рейса по ящикам =
          введённое число). Нужны ящики иначе — отгрузите строки по одной в блоке выше.
        </p>
        <label htmlFor="op-sel-ship-naklad-all" style={{ fontSize: "0.88rem" }}>
          Накладная
        </label>
        <select
          id="op-sel-ship-naklad-all"
          value={shipAllDocumentId}
          onChange={(e) => {
            setShipAllDocumentId(e.target.value);
            setShipAllTotalPackages("");
          }}
          style={selectWide}
        >
          <option value="">— выберите накладную —</option>
          {nakladOptionsForShipAll.map((o) => (
            <option key={o.documentId} value={o.documentId}>
              № {o.documentNumber}
            </option>
          ))}
        </select>
        {shipAllDocumentId ? (
          <p style={{ ...muted, marginTop: "0.35rem", fontSize: "0.82rem" }}>
            <Link to={purchaseNakladnayaDocumentPath(shipAllDocumentId)}>Открыть накладную</Link>
          </p>
        ) : null}
        <label htmlFor="op-in-ship-naklad-pkg-total" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          Ящиков в этой отгрузке по накладной, всего (опц.)
        </label>
        <input
          id="op-in-ship-naklad-pkg-total"
          value={shipAllTotalPackages}
          onChange={(e) => setShipAllTotalPackages(e.target.value)}
          style={fieldStyle}
          inputMode="numeric"
          autoComplete="off"
          placeholder="пусто = без ящиков в API; кг по строкам как обычно"
          disabled={!shipAllDocumentId}
        />
        <button
          type="button"
          style={{ ...btnStyle, marginTop: "0.35rem" }}
          disabled={
            shipAllFromNaklad.isPending ||
            !shipTripId.trim() ||
            !shipAllDocumentId ||
            nakladOptionsForShipAll.length === 0
          }
          aria-busy={shipAllFromNaklad.isPending || undefined}
          onClick={() => shipAllFromNaklad.mutate()}
        >
          {shipAllFromNaklad.isPending ? "Отгрузка…" : "Отгрузить всю накладную в этот рейс"}
        </button>
            <ErrorText e={shipAllFromNaklad.error as Error | null} />
            {shipAllFromNaklad.isSuccess && (
              <p style={successText} role="status">
                Все строки с остатком отгружены.
              </p>
            )}
          </>
        )}

        {distShipBatchIds != null && distShipBatchIds.length > 0 && (
          <div className="no-print birzha-banner-distribution" role="region" aria-labelledby="dist-ship-h">
            <h4 id="dist-ship-h" style={{ fontSize: "0.9rem", margin: "0 0 0.4rem" }}>
              Отбор из «Распределения» → рейс
            </h4>
            <p style={{ ...muted, margin: "0 0 0.4rem", fontSize: "0.86rem", lineHeight: 1.5 }}>
              Перенесён список <strong>{distShipBatchIds.length}</strong> {distShipBatchIds.length === 1 ? "партии" : "партий"}.
              С <strong>остатком сейчас</strong> готово к отгрузке: <strong>{distBatchesToShip.length}</strong>. Для
              каждой вызывается <code>POST /api/batches/…/ship-to-trip</code> (кг = полный остаток по партии, как в одиночной
              отгрузке). {distBatchesMissingCount > 0 && (
                <>
                  {" "}
                  {distBatchesMissingCount} из списка уже <strong>без остатка</strong> (часть увезли раньше) — в отгрузку не
                  пошли.
                </>
              )}
            </p>
            <p style={{ ...muted, fontSize: "0.8rem", margin: "0 0 0.4rem" }}>
              Сначала выберите <strong>рейс</strong> (создайте выше «Создать рейс», если его ещё нет), затем нажмите кнопку.
            </p>
            {distByCaliberSummary.length > 0 && (
              <p style={{ ...muted, fontSize: "0.8rem", margin: "0 0 0.4rem" }}>
                Свод по калибрам (одна сборная накладная):{" "}
                {distByCaliberSummary
                  .map((r) => `${r.line}: ${r.kg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`)
                  .join(" · ")}
                .
              </p>
            )}
            <p style={{ margin: "0.35rem 0 0" }}>
              <button
                type="button"
                style={btnStyle}
                disabled={shipFromDistribution.isPending || !shipTripId.trim() || distBatchesToShip.length === 0}
                aria-busy={shipFromDistribution.isPending || undefined}
                onClick={() => shipFromDistribution.mutate()}
              >
                {shipFromDistribution.isPending
                  ? "Отгрузка…"
                  : "Отгрузить весь отбор из «Распределения» в выбранный рейс"}
              </button>{" "}
              <button
                type="button"
                style={btnStyle}
                disabled={shipFromDistribution.isPending}
                onClick={() => {
                  setDistShipBatchIds(null);
                  clearDistributionShipPayload();
                }}
              >
                Сбросить отбор
              </button>{" "}
              <Link to={ops.distribution} style={{ fontSize: "0.86rem" }}>
                к распределению
              </Link>
            </p>
            <ErrorText e={shipFromDistribution.error as Error | null} />
          </div>
        )}
      </section>

      <section className="birzha-panel" aria-labelledby="op-sec-sell">
        <h3 id="op-sec-sell" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          2. Продать с рейса
        </h3>
        <p style={muted}>
          Партия приходит из <strong>уже созданной накладной</strong> (строка = калибр). Сначала выберите <strong>рейс</strong>, затем
          строку: список сгруппирован <strong>по накладной</strong> (как одна общая отгрузка по рейсу), внутри группы — калибры и кг в пути.
          <strong>Килограммы</strong> в продаже обязательны; <strong>ящики</strong> в теле API не уходят — оценка только для подсказки.
        </p>
        <p style={muted}>
          <code>POST /api/batches/:batchId/sell-from-trip</code> — кг по умолчанию = весь доступный остаток в пути.
        </p>
        <label htmlFor="op-sel-sell-trip" style={{ fontSize: "0.88rem" }}>
          Рейс *
        </label>
        <select
          id="op-sel-sell-trip"
          value={sellTripId}
          onChange={(e) => {
            const v = e.target.value;
            setSellTripId(v);
            setSellBatchId("");
            setSellKg("");
          }}
          style={{ ...selectWide, marginBottom: "0.5rem" }}
          disabled={trips.isPending}
          aria-busy={trips.isPending || undefined}
        >
          <option value="">{trips.isPending ? "— загрузка —" : "— выберите рейс —"}</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {formatTripSelectLabel(t)}
            </option>
          ))}
        </select>
        {sellTripIdTrim && sellReportQuery.isFetching && (
          <p style={{ marginTop: 0, marginBottom: "0.5rem" }} role="status" aria-live="polite">
            <LoadingIndicator
              size="sm"
              label={
                sellReportQuery.isPending
                  ? "Загрузка остатков по рейсу (shipment-report)…"
                  : "Обновление остатков по рейсу…"
              }
            />
          </p>
        )}
        {sellTripIdTrim && sellReportQuery.isError && (
          <p role="alert" style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
            Не удалось загрузить отчёт рейса (GET /api/trips/…/shipment-report). Продажа по списку недоступна — укажите
            batchId вручную ниже.
          </p>
        )}
        {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length === 0 && (
          <p style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
            На этом рейсе нет массы для продажи: не было отгрузок в рейс или весь товар уже продан / списан по недостаче.
          </p>
        )}
        <label htmlFor="op-sel-sell-batch-line" style={{ fontSize: "0.88rem" }}>
          Партия (по накладным и калибрам · кг в пути) *
        </label>
        <select
          id="op-sel-sell-batch-line"
          value={sellBatchId}
          onChange={(e) => {
            const id = e.target.value;
            setSellBatchId(id);
            const row = sellableOnTripRows.find((r) => r.batchId === id);
            if (row) {
              setSellKg(gramsBigIntToKgDecimalString(row.netTransitG));
            }
          }}
          style={{ ...selectWide, marginBottom: "0.2rem" }}
          disabled={
            !sellTripIdTrim ||
            (Boolean(sellTripIdTrim) && !sellReportQuery.isFetched) ||
            (sellReportQuery.isSuccess && sellableOnTripRows.length === 0) ||
            (sellReportQuery.isFetched && sellReportQuery.isError)
          }
        >
          <option value="">
            {!sellTripIdTrim
              ? "— сначала выберите рейс —"
              : !sellReportQuery.isFetched
                ? "… загрузка остатков …"
                : sellReportQuery.isError
                  ? "— отчёт не загрузился, batchId ниже —"
                  : "— выберите калибр в группе накладной —"}
          </option>
          {sellTripRowsByNaklad.map((g) => (
            <optgroup key={g.key} label={g.optgroupLabel}>
              {g.rows.map((row) => (
                <option key={row.batchId} value={row.batchId}>
                  {formatSellBatchOptionLabel(row, { includeNakladPrefix: false })}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {sellSelectionSummary && (
          <p
            id="op-sell-naklad-summary"
            style={{ ...muted, fontSize: "0.86rem", marginTop: 0, marginBottom: "0.5rem" }}
            role="status"
            aria-live="polite"
          >
            <strong>Накладная № {sellSelectionSummary.doc}</strong> — {sellSelectionSummary.line}
            {". "}
            <strong>В пути: {sellSelectionSummary.kg} кг</strong>
            {sellSelectionSummary.hasPkgData && sellSelectionSummary.estPkg > 0n && (
              <>
                {" "}
                · <strong>≈ {String(sellSelectionSummary.estPkg)} ящ</strong> (оценка по кг в отгрузке)
              </>
            )}
            {sellSelectionSummary.subUnitPackages && (
              <> · остаток в пути &lt; 1 ящ (оценка по кг), в сделке — кг</>
            )}
            {sellSelectionSummary.hasShipped && !sellSelectionSummary.hasPkgData && (
              <> · ящики в отчёте не заданы — введите при «Отгрузить в рейс», иначе оценки нет</>
            )}
          </p>
        )}
        <label htmlFor="op-in-sell-batch" style={{ fontSize: "0.88rem" }}>
          batchId (вручную, если список недоступен)
        </label>
        <input
          id="op-in-sell-batch"
          value={sellBatchId}
          onChange={(e) => setSellBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
          placeholder="совпадает с выбором выше"
        />
        <label htmlFor="op-in-sell-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          kg *
        </label>
        <input
          id="op-in-sell-kg"
          value={sellKg}
          onChange={(e) => setSellKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-sell-sale" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          saleId (опц., иначе UUID)
        </label>
        <input
          id="op-in-sell-sale"
          value={saleId}
          onChange={(e) => setSaleId(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <label htmlFor="op-in-sell-price" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          pricePerKg (руб/кг) *
        </label>
        <input
          id="op-in-sell-price"
          value={sellPrice}
          onChange={(e) => setSellPrice(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        {counterpartiesCatalog && (
          <>
            <label htmlFor="op-sel-sell-cp" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              Контрагент (справочник)
            </label>
            <select
              id="op-sel-sell-cp"
              value={sellCounterpartyId}
              onChange={(e) => setSellCounterpartyId(e.target.value)}
              style={selectWide}
              disabled={counterpartiesQ.isPending}
              aria-busy={counterpartiesQ.isPending || undefined}
            >
              <option value="">
                {counterpartiesQ.isPending ? "— загрузка справочника —" : "— подпись вручную (ниже) —"}
              </option>
              {(counterpartiesQ.data?.counterparties ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <label htmlFor="op-in-new-cp" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              Новый контрагент (POST /counterparties)
            </label>
            <input
              id="op-in-new-cp"
              value={newCounterpartyName}
              onChange={(e) => setNewCounterpartyName(e.target.value)}
              style={fieldStyle}
              placeholder="название"
              maxLength={200}
              autoComplete="off"
            />
            <button
              type="button"
              style={{ ...btnStyle, marginTop: "0.35rem" }}
              disabled={createCounterparty.isPending}
              onClick={() => createCounterparty.mutate()}
            >
              {createCounterparty.isPending ? "…" : "Добавить в справочник"}
            </button>
            <ErrorText e={createCounterparty.error as Error | null} />
          </>
        )}
        <label htmlFor="op-in-sell-client" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          Клиент вручную (опц., если не выбран справочник)
        </label>
        <input
          id="op-in-sell-client"
          value={sellClientLabel}
          onChange={(e) => setSellClientLabel(e.target.value)}
          style={fieldStyle}
          placeholder="например ИП Иванов"
          maxLength={120}
          autoComplete="off"
          disabled={Boolean(sellCounterpartyId)}
        />
        <label htmlFor="op-sel-sell-pay" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          paymentKind
        </label>
        <select
          id="op-sel-sell-pay"
          value={paymentKind}
          onChange={(e) => setPaymentKind(e.target.value as "cash" | "debt" | "mixed")}
          style={fieldStyle}
        >
          <option value="cash">cash — вся выручка наличными</option>
          <option value="debt">debt — вся выручка в долг</option>
          <option value="mixed">mixed — часть налом (cashKopecksMixed)</option>
        </select>
        {paymentKind === "mixed" && (
          <>
            <label htmlFor="op-in-sell-mixed" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
              cashKopecksMixed (копейки, строка цифр) *
            </label>
            <input
              id="op-in-sell-mixed"
              value={cashMixed}
              onChange={(e) => setCashMixed(e.target.value)}
              style={fieldStyle}
              placeholder="например 50000"
              inputMode="numeric"
              autoComplete="off"
            />
          </>
        )}
        <button
          type="button"
          style={btnStyle}
          disabled={sell.isPending}
          aria-busy={sell.isPending || undefined}
          onClick={() => sell.mutate()}
        >
          {sell.isPending ? "…" : "Продать"}
        </button>
        <ErrorText e={sell.error as Error | null} />
        {sell.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </section>

      <section className="birzha-panel" aria-labelledby="op-sec-short">
        <h3 id="op-sec-short" style={{ margin: "0 0 0.35rem", fontSize: "0.98rem" }}>
          3. Недостача по рейсу (приёмка)
        </h3>
        <p style={muted}>POST /api/batches/:batchId/record-trip-shortage</p>
        <label htmlFor="op-in-short-batch" style={{ fontSize: "0.88rem" }}>
          batchId *
        </label>
        <input
          id="op-in-short-batch"
          value={shortBatchId}
          onChange={(e) => setShortBatchId(e.target.value)}
          style={fieldStyle}
          list="batch-suggestions"
          autoComplete="off"
        />
        <label htmlFor="op-sel-short-trip" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          tripId *
        </label>
        <select
          id="op-sel-short-trip"
          value={shortTripId}
          onChange={(e) => setShortTripId(e.target.value)}
          style={selectWide}
          disabled={trips.isPending}
          aria-busy={trips.isPending || undefined}
        >
          <option value="">{trips.isPending ? "— загрузка —" : "— выберите рейс —"}</option>
          {trips.options.map((t) => (
            <option key={t.id} value={t.id}>
              {formatTripSelectLabel(t)}
            </option>
          ))}
        </select>
        <label htmlFor="op-in-short-kg" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          kg *
        </label>
        <input
          id="op-in-short-kg"
          value={shortKg}
          onChange={(e) => setShortKg(e.target.value)}
          style={fieldStyle}
          inputMode="decimal"
          autoComplete="off"
        />
        <label htmlFor="op-in-short-reason" style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
          reason *
        </label>
        <input
          id="op-in-short-reason"
          value={shortReason}
          onChange={(e) => setShortReason(e.target.value)}
          style={fieldStyle}
          autoComplete="off"
        />
        <button
          type="button"
          style={btnStyle}
          disabled={shortage.isPending}
          aria-busy={shortage.isPending || undefined}
          onClick={() => shortage.mutate()}
        >
          {shortage.isPending ? "…" : "Зафиксировать недостачу"}
        </button>
        <ErrorText e={shortage.error as Error | null} />
        {shortage.isSuccess && (
          <p style={successText} role="status">
            Готово.
          </p>
        )}
      </section>
    </div>
  );
}
