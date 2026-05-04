import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import {
  buildTripBatchRows,
  estimateNetTransitPackageCount,
  type TripBatchTableRow,
} from "../format/trip-report-rows.js";
import { useAuth } from "../auth/auth-context.js";
import {
  batchesByIdsQueryOptions,
  batchesSearchQueryOptions,
  counterpartiesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
} from "../query/core-list-queries.js";
import { parseSellFromTripForm } from "../validation/api-schemas.js";
import { TripSearchPicker } from "./TripSearchPicker.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyle, fieldStyle, muted, successText, warnText } from "../ui/styles.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

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

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export type SellFromTripVariant = "seller" | "operations";

/**
 * Одна форма продажи с рейса: рейс → партия (калибр) → кг, цена, оплата.
 * Используется в кабинете продавца (/s) и в общих операциях (/o/operations).
 */
export function SellFromTripSection({ variant }: { variant: SellFromTripVariant }) {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const idPrefix = variant === "seller" ? "seller-sell" : "op-sell";
  /** Якорь для прокрутки `?focus=sell` */
  const scrollTargetId = variant === "seller" ? "seller-work-sell" : "op-sec-sell";
  const headingId = `${scrollTargetId}-h`;

  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
  };

  const counterpartiesCatalog = meta?.counterpartyCatalogApi === "enabled";
  const counterpartiesQ = useQuery({
    ...counterpartiesFullListQueryOptions(),
    enabled: counterpartiesCatalog,
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
  const [partyFilter, setPartyFilter] = useState("");
  const [batchIdSearch, setBatchIdSearch] = useState("");
  const debouncedBatchIdSearch = useDebouncedValue(batchIdSearch, 300);

  useEffect(() => {
    const p = searchParams.get("trip")?.trim() ?? "";
    if (!p) {
      return;
    }
    setSellTripId(p);
    setSellBatchId("");
    setSellKg("");
  }, [searchParams]);

  useEffect(() => {
    setPartyFilter("");
  }, [sellTripId]);

  useLayoutEffect(() => {
    if (searchParams.get("focus") !== "sell") {
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    const qs = next.toString();
    void navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [searchParams, navigate, location.pathname, scrollTargetId]);

  const sellTripIdTrim = sellTripId.trim();
  const sellReportQuery = useQuery({
    ...shipmentReportQueryOptions(sellTripIdTrim),
    enabled: sellTripIdTrim.length > 0,
  });

  const sellableOnTripRows = useMemo(() => {
    if (!sellReportQuery.data) {
      return [] as TripBatchTableRow[];
    }
    return buildTripBatchRows(sellReportQuery.data).filter((r) => r.netTransitG > 0n);
  }, [sellReportQuery.data]);

  const batchIdsOnTrip = useMemo(
    () => [...new Set(sellableOnTripRows.map((r) => r.batchId))].sort(),
    [sellableOnTripRows],
  );

  const batchesForTripQuery = useQuery(batchesByIdsQueryOptions(batchIdsOnTrip));

  const batchByIdForSell = useMemo(() => {
    const m = new Map<string, BatchListItem>();
    for (const b of batchesForTripQuery.data?.batches ?? []) {
      m.set(b.id, b);
    }
    return m;
  }, [batchesForTripQuery.data?.batches]);

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

  const sellTripRowsFiltered = useMemo(() => {
    const q = partyFilter.trim().toLowerCase();
    if (!q) {
      return sellTripRowsByNaklad;
    }
    return sellTripRowsByNaklad
      .map((g) => ({
        ...g,
        rows: g.rows.filter((row) => {
          const label = formatSellBatchOptionLabel(row).toLowerCase();
          return label.includes(q) || row.batchId.toLowerCase().includes(q);
        }),
      }))
      .filter((g) => g.rows.length > 0);
  }, [sellTripRowsByNaklad, partyFilter]);

  const batchSuggestQuery = useQuery(batchesSearchQueryOptions(debouncedBatchIdSearch, 20));

  const sellSelectionSummary = useMemo((): {
    line: string;
    doc: string;
    kg: string;
    estPkg: bigint;
    hasShipped: boolean;
    hasPkgData: boolean;
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
      const j = await apiPostJson("/api/counterparties", { displayName });
      return j as { counterparty: { id: string; displayName: string } };
    },
    onSuccess: async (data) => {
      setNewCounterpartyName("");
      setSellCounterpartyId(data.counterparty.id);
      await queryClient.invalidateQueries({ queryKey: queryRoots.counterparties });
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
      await apiPostJson(`/api/batches/${encodeURIComponent(batchId)}/sell-from-trip`, body);
      return { saleId: body.saleId };
    },
    onSuccess: () => invalidateDomain(),
  });

  return (
    <section
      className={variant === "seller" ? "birzha-panel birzha-seller-sell-panel" : "birzha-panel"}
      aria-labelledby={headingId}
      id={scrollTargetId}
    >
      <h3 id={headingId} style={{ margin: "0 0 0.35rem", fontSize: variant === "seller" ? "1.05rem" : "0.98rem" }}>
        {variant === "seller" ? "Продажа с рейса" : "3. Продажа с рейса"}
      </h3>
      {variant === "seller" ? (
        <p style={{ ...muted, marginBottom: "0.65rem", lineHeight: 1.55, fontSize: "0.95rem" }}>
          Выберите рейс, партию, кг, цену и оплату.
        </p>
      ) : (
        <>
          <p style={muted}>
            Выберите рейс, калибр, кг, цену и оплату.
          </p>
          {import.meta.env.DEV && (
            <details style={{ ...muted, marginBottom: "0.6rem", fontSize: "0.82rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Технические детали API</summary>
              <p style={{ margin: "0.35rem 0 0", lineHeight: 1.45 }}>
                <code>POST /api/batches/:batchId/sell-from-trip</code> — поле кг по умолчанию подставляется из остатка
                «в пути» по партии.
              </p>
            </details>
          )}
        </>
      )}

      <span style={{ fontSize: "0.88rem", display: "block", marginBottom: "0.25rem" }}>Рейс *</span>
      <TripSearchPicker
        idPrefix={idPrefix}
        value={sellTripId}
        onChange={(v) => {
          setSellTripId(v);
          setSellBatchId("");
          setSellKg("");
        }}
      />
      {sellTripIdTrim && sellReportQuery.isFetching && (
        <p style={{ marginTop: 0, marginBottom: "0.5rem" }} role="status" aria-live="polite">
          <LoadingIndicator
            size="sm"
            label={
              sellReportQuery.isPending ? "Загрузка остатков по рейсу…" : "Обновление остатков по рейсу…"
            }
          />
        </p>
      )}
      {sellTripIdTrim && sellReportQuery.isError && (
        <p role="alert" style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
          Не удалось загрузить данные по рейсу. Продажа по списку недоступна — укажите ID партии вручную ниже.
        </p>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length === 0 && (
        <p style={{ ...warnText, marginTop: 0, marginBottom: "0.5rem" }}>
          На этом рейсе нет массы для продажи: не было отгрузок со склада в рейс или весь товар уже продан / списан по недостаче.
        </p>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length > 0 && batchesForTripQuery.isFetching && (
        <p style={{ ...muted, marginTop: 0, marginBottom: "0.45rem", fontSize: "0.86rem" }} role="status">
          <LoadingIndicator size="sm" label="Загрузка накладных по строкам рейса…" />
        </p>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length > 0 && (
        <>
          <label htmlFor={`${idPrefix}-party-filter`} style={{ fontSize: "0.88rem" }}>
            Фильтр списка партий (накладная, калибр, id)
          </label>
          <input
            id={`${idPrefix}-party-filter`}
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            style={{ ...fieldStyle, marginBottom: "0.45rem", maxWidth: "100%" }}
            placeholder="Сузить длинный список…"
            autoComplete="off"
          />
        </>
      )}
      <label htmlFor={`${idPrefix}-sel-batch`} style={{ fontSize: "0.88rem" }}>
        Накладная и калибр (кг в машине) *
      </label>
      <select
        id={`${idPrefix}-sel-batch`}
        value={sellBatchId}
        onChange={(e) => {
          const id = e.target.value;
          setSellBatchId(id);
          const row = sellableOnTripRows.find((r) => r.batchId === id);
          if (row) {
            setSellKg(gramsBigIntToKgDecimalString(row.netTransitG));
          }
        }}
        style={{ ...selectWide, marginBottom: "0.2rem", maxHeight: "min(50vh, 22rem)" }}
        disabled={
          !sellTripIdTrim ||
          (Boolean(sellTripIdTrim) && !sellReportQuery.isFetched) ||
          (sellReportQuery.isSuccess && sellableOnTripRows.length === 0) ||
          (sellReportQuery.isFetched && sellReportQuery.isError) ||
          (batchIdsOnTrip.length > 0 && batchesForTripQuery.isPending)
        }
      >
        <option value="">
          {!sellTripIdTrim
            ? "— сначала выберите рейс —"
            : !sellReportQuery.isFetched
              ? "… загрузка остатков …"
              : sellReportQuery.isError
                ? "— список недоступен, введите ID партии ниже —"
                : batchesForTripQuery.isPending && batchIdsOnTrip.length > 0
                  ? "… загрузка партий …"
                  : "— выберите партию (калибр) —"}
        </option>
        {sellTripRowsFiltered.map((g) => (
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
          {sellSelectionSummary.subUnitPackages && <> · остаток в пути &lt; 1 ящ (оценка по кг), в сделке — кг</>}
          {sellSelectionSummary.hasShipped && !sellSelectionSummary.hasPkgData && (
            <> · ящики в отчёте не заданы — введите при отгрузке со склада в рейс, иначе оценки нет</>
          )}
        </p>
      )}
      <label htmlFor={`${idPrefix}-in-batch`} style={{ fontSize: "0.88rem" }}>
        ID партии вручную (если список выше не загрузился)
      </label>
      <input
        id={`${idPrefix}-in-batch`}
        value={sellBatchId}
        onChange={(e) => setSellBatchId(e.target.value)}
        style={fieldStyle}
        autoComplete="off"
        placeholder="совпадает с выбором выше"
      />
      <label htmlFor={`${idPrefix}-batch-id-search`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.45rem" }}>
        Подбор партии по фрагменту id (от 2 символов)
      </label>
      <input
        id={`${idPrefix}-batch-id-search`}
        value={batchIdSearch}
        onChange={(e) => setBatchIdSearch(e.target.value)}
        style={fieldStyle}
        autoComplete="off"
        placeholder="введите часть id партии"
      />
      {batchSuggestQuery.data && batchSuggestQuery.data.batches.length > 0 && (
        <ul
          className="birzha-scroll-panel"
          style={{ listStyle: "none", margin: "0.35rem 0 0", padding: "0.35rem 0.45rem" }}
          aria-label="Подходящие партии"
        >
          {batchSuggestQuery.data.batches.map((b) => (
            <li key={b.id} style={{ marginBottom: "0.25rem" }}>
              <button
                type="button"
                style={{
                  ...btnStyle,
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: "0.86rem",
                  padding: "0.4rem 0.55rem",
                  wordBreak: "break-all",
                }}
                onClick={() => {
                  setSellBatchId(b.id);
                  setBatchIdSearch("");
                }}
              >
                {b.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={`${idPrefix}-in-kg`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
        Сколько килограмм в этой продаже *
      </label>
      <input
        id={`${idPrefix}-in-kg`}
        value={sellKg}
        onChange={(e) => setSellKg(e.target.value)}
        style={fieldStyle}
        inputMode="decimal"
        autoComplete="off"
      />
      <label htmlFor={`${idPrefix}-in-sale`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
        Номер продажи (необязательно, иначе система создаст сама)
      </label>
      <input
        id={`${idPrefix}-in-sale`}
        value={saleId}
        onChange={(e) => setSaleId(e.target.value)}
        style={fieldStyle}
        autoComplete="off"
      />
      <label htmlFor={`${idPrefix}-in-price`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
        Цена за 1 кг, руб *
      </label>
      <input
        id={`${idPrefix}-in-price`}
        value={sellPrice}
        onChange={(e) => setSellPrice(e.target.value)}
        style={fieldStyle}
        inputMode="decimal"
        autoComplete="off"
      />
      {counterpartiesCatalog && (
        <>
          <label htmlFor={`${idPrefix}-sel-cp`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
            Контрагент (справочник)
          </label>
          <select
            id={`${idPrefix}-sel-cp`}
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
          <label htmlFor={`${idPrefix}-in-new-cp`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
            Новый контрагент
          </label>
          <input
            id={`${idPrefix}-in-new-cp`}
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
          <FieldError error={createCounterparty.error as Error | null} />
        </>
      )}
      <label htmlFor={`${idPrefix}-in-client`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
        Клиент вручную (опц., если не выбран справочник)
      </label>
      <input
        id={`${idPrefix}-in-client`}
        value={sellClientLabel}
        onChange={(e) => setSellClientLabel(e.target.value)}
        style={fieldStyle}
        placeholder="например ИП Иванов"
        maxLength={120}
        autoComplete="off"
        disabled={Boolean(sellCounterpartyId)}
      />
      <label htmlFor={`${idPrefix}-sel-pay`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
        Как оплатил клиент *
      </label>
      <select
        id={`${idPrefix}-sel-pay`}
        value={paymentKind}
        onChange={(e) => setPaymentKind(e.target.value as "cash" | "debt" | "mixed")}
        style={fieldStyle}
      >
        <option value="cash">Вся сумма наличными</option>
        <option value="debt">Вся сумма в долг (без наличных)</option>
        <option value="mixed">Смешанно: часть наличными (укажите ниже)</option>
      </select>
      {paymentKind === "mixed" && (
        <>
          <label htmlFor={`${idPrefix}-in-mixed`} style={{ fontSize: "0.88rem", display: "block", marginTop: "0.5rem" }}>
            Сколько наличными из сделки (копейки, только цифры) *
          </label>
          <input
            id={`${idPrefix}-in-mixed`}
            value={cashMixed}
            onChange={(e) => setCashMixed(e.target.value)}
            style={fieldStyle}
            placeholder="например 50000 (= 500 руб)"
            inputMode="numeric"
            autoComplete="off"
          />
        </>
      )}
      <button
        type="button"
        style={{
          ...btnStyle,
          ...(variant === "seller"
            ? { fontSize: "1.1rem", padding: "0.75rem 1.15rem", fontWeight: 700, marginTop: "0.65rem" }
            : { marginTop: "0.5rem" }),
        }}
        disabled={sell.isPending}
        aria-busy={sell.isPending || undefined}
        onClick={() => sell.mutate()}
      >
        {sell.isPending ? "Сохранение…" : "Зафиксировать продажу"}
      </button>
      <FieldError error={sell.error as Error | null} />
      {sell.isSuccess && (
        <p style={successText} role="status">
          Готово.
        </p>
      )}
    </section>
  );
}
