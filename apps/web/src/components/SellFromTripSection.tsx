import { purchaseLineAmountKopecksFromDecimalStrings } from "@birzha/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import { isLikelyNetworkOrOfflineFailure } from "../api/is-network-or-offline-failure.js";
import type { BatchListItem, TripJson } from "../api/types.js";
import { formatNakladLineLabel, formatShortBatchId } from "../format/batch-label.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import {
  buildTripBatchRows,
  estimateNetTransitPackageCount,
  type TripBatchTableRow,
} from "../format/trip-report-rows.js";
import { useAuth } from "../auth/auth-context.js";
import { useNavigatorOnLine } from "../hooks/useNavigatorOnLine.js";
import {
  batchesByIdsQueryOptions,
  batchesSearchQueryOptions,
  counterpartiesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFullListQueryOptions,
  wholesalersFullListQueryOptions,
} from "../query/core-list-queries.js";
import { kopecksToRubLabel } from "../format/money.js";
import { parseSellFromTripForm } from "../validation/api-schemas.js";
import { routes } from "../routes.js";
import { enqueue, requestOutboxBackgroundSync } from "../sync/index.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { TripSearchPicker } from "./TripSearchPicker.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyle, fieldStyle, successText, warnText } from "../ui/styles.js";

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
  const online = useNavigatorOnLine();
  const isSellerUx = variant === "seller";
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
  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const counterpartiesQ = useQuery({
    ...counterpartiesFullListQueryOptions(),
    enabled: counterpartiesCatalog,
  });
  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled: wholesalersCatalog,
  });

  const [sellBatchId, setSellBatchId] = useState("");
  const [sellTripId, setSellTripId] = useState("");
  const [sellKg, setSellKg] = useState("");
  const [saleId, setSaleId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [saleChannel, setSaleChannel] = useState<"retail" | "wholesale">("retail");
  const [wholesaleBuyerId, setWholesaleBuyerId] = useState("");
  const [wholesalerSearch, setWholesalerSearch] = useState("");
  const [paymentKind, setPaymentKind] = useState<"cash" | "debt" | "mixed" | "card_transfer">("cash");
  const sellerFieldClass = isSellerUx ? "birzha-seller-form-control" : undefined;
  const sellerFieldMb = { marginBottom: "0.45rem" as const, maxWidth: "100%" as const };
  const [cashMixed, setCashMixed] = useState("");
  const [cardTransferKopecks, setCardTransferKopecks] = useState("");
  const [sellClientLabel, setSellClientLabel] = useState("");
  const [sellCounterpartyId, setSellCounterpartyId] = useState("");
  const [newCounterpartyName, setNewCounterpartyName] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  const [batchIdSearch, setBatchIdSearch] = useState("");
  const debouncedBatchIdSearch = useDebouncedValue(batchIdSearch, 300);

  const sellerFlashDomId = `${idPrefix}-sale-flash`;
  const [sellerSaleFlash, setSellerSaleFlash] = useState<{
    saleId: string;
    kg: string;
    sumRub: string;
    productLine: string;
    /** Продажа сохранена в офлайн-очередь (отправка при сети). */
    queued?: boolean;
  } | null>(null);
  const [operationsQueuedHint, setOperationsQueuedHint] = useState<string | null>(null);

  useEffect(() => {
    setSellerSaleFlash(null);
  }, [sellTripId, sellBatchId]);

  useEffect(() => {
    const p = searchParams.get("trip")?.trim() ?? "";
    if (!p) {
      return;
    }
    setSellTripId(p);
    setSellBatchId("");
    setSellKg("");
  }, [searchParams]);

  const sellerTripsListQ = useQuery({
    ...tripsFullListQueryOptions(),
    enabled: isSellerUx,
  });

  /** Один закреплённый рейс — сразу подставляем (меньше шагов для продавца). */
  useEffect(() => {
    if (!isSellerUx) {
      return;
    }
    const fromUrl = searchParams.get("trip")?.trim() ?? "";
    if (fromUrl) {
      return;
    }
    if (sellTripId.trim()) {
      return;
    }
    const list = sellerTripsListQ.data?.trips ?? [];
    if (list.length !== 1) {
      return;
    }
    setSellTripId(list[0]!.id);
  }, [isSellerUx, searchParams, sellTripId, sellerTripsListQ.data?.trips]);

  /** В кабинете продавца — без смешанного «нал + долг»; онлайн-перевод на карту + нал разрешён (не эквайринг). */
  useEffect(() => {
    if (!isSellerUx) {
      return;
    }
    if (paymentKind === "mixed") {
      setPaymentKind("cash");
      setCashMixed("");
    }
  }, [isSellerUx, paymentKind]);

  useEffect(() => {
    setPartyFilter("");
  }, [sellTripId]);

  useEffect(() => {
    if (saleChannel === "retail") {
      setWholesaleBuyerId("");
      setWholesalerSearch("");
    }
  }, [saleChannel]);

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

  const sellerTripOptions = useMemo(
    () => sortTripsByTripNumberAsc(sellerTripsListQ.data?.trips ?? []),
    [sellerTripsListQ.data?.trips],
  );

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

  /** Есть ли в отчёте рейса ненулевая отгрузка со склада в рейс (без этого продавцу нечего выбирать). */
  const tripHasPositiveShipment = useMemo(() => {
    if (!sellReportQuery.data) {
      return false;
    }
    return sellReportQuery.data.shipment.byBatch.some((b) => {
      try {
        return BigInt(b.grams || "0") > 0n;
      } catch {
        return false;
      }
    });
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

  /** Сумма сделки в копейках по полям кг и ₽/кг (как строка накладной). */
  const sellDealTotalKopecks = useMemo(
    () =>
      purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, { kgMaxFrac: 6, priceMaxFrac: 4 }),
    [sellKg, sellPrice],
  );

  const sellDealTotalLabel = useMemo(() => {
    if (!Number.isFinite(sellDealTotalKopecks) || sellDealTotalKopecks < 0) {
      return null;
    }
    const rounded = Math.round(sellDealTotalKopecks);
    return kopecksToRubLabel(String(rounded));
  }, [sellDealTotalKopecks]);

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

  const wholesaleRowsFiltered = useMemo(() => {
    const all = wholesalersQ.data?.wholesalers ?? [];
    const active = all.filter((w) => w.isActive);
    const q = wholesalerSearch.trim().toLowerCase();
    if (!q) {
      return active;
    }
    return active.filter((w) => w.name.toLowerCase().includes(q));
  }, [wholesalersQ.data?.wholesalers, wholesalerSearch]);

  const selectedWholesalerLabel = useMemo(() => {
    if (!wholesaleBuyerId) {
      return "";
    }
    const w = (wholesalersQ.data?.wholesalers ?? []).find((x) => x.id === wholesaleBuyerId);
    return w?.name ?? "";
  }, [wholesaleBuyerId, wholesalersQ.data?.wholesalers]);

  const batchSuggestQuery = useQuery(batchesSearchQueryOptions(debouncedBatchIdSearch, 20));

  /** Для продавца: список партий на рейсе загрузился и есть что продавать — технический fallback скрываем. */
  const sellerBatchListReady =
    isSellerUx &&
    sellReportQuery.isSuccess &&
    sellableOnTripRows.length > 0 &&
    batchesForTripQuery.isFetched;

  /** Ручной ввод id партии — не показывать пока грузится отчёт (иначе мелькает блок «не видно товар»). */
  const showBatchManualControls =
    !isSellerUx ||
    (Boolean(sellTripIdTrim) && !sellReportQuery.isPending && !sellerBatchListReady);

  const showBatchListFilter =
    Boolean(sellTripIdTrim) &&
    sellReportQuery.isSuccess &&
    sellableOnTripRows.length > 0 &&
    (isSellerUx ? sellableOnTripRows.length > 12 : true);

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
      if (!online) {
        throw new Error(
          "Нет сети: новый контрагент в справочник не создаётся. Выберите из списка или укажите подпись в поле ниже.",
        );
      }
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
        saleChannel,
        paymentKind,
        cashMixed,
        cardTransferKopecks,
        clientLabel: sellClientLabel,
        counterpartyId: sellCounterpartyId || undefined,
        wholesaleBuyerId: saleChannel === "wholesale" ? wholesaleBuyerId : undefined,
      });
      const url = `/api/batches/${encodeURIComponent(batchId)}/sell-from-trip`;
      let queued = false;
      try {
        await apiPostJson(url, body);
      } catch (e) {
        const syncEnabled = meta?.syncApi === "enabled";
        if (!syncEnabled && isLikelyNetworkOrOfflineFailure(e)) {
          throw new Error(
            "Нет связи с сервером, а синхронизация очереди на сервере недоступна. Подключите интернет или обратитесь к администратору.",
          );
        }
        if (syncEnabled && isLikelyNetworkOrOfflineFailure(e)) {
          await enqueue({
            actionType: "sell_from_trip",
            payload: { batchId, ...body },
          });
          void requestOutboxBackgroundSync();
          void queryClient.invalidateQueries({ queryKey: ["outbox"] });
          queued = true;
        } else {
          throw e;
        }
      }
      const totalKopecks = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, {
        kgMaxFrac: 6,
        priceMaxFrac: 4,
      });
      const sumRub =
        Number.isFinite(totalKopecks) && totalKopecks >= 0
          ? kopecksToRubLabel(String(Math.round(totalKopecks)))
          : "—";
      const productLine =
        sellSelectionSummary?.line?.trim() ||
        (sellBatchId.trim() ? `Партия ${formatShortBatchId(sellBatchId)}` : "Товар");
      return {
        saleId: body.saleId,
        kg: sellKg.trim(),
        sumRub,
        productLine,
        queued,
      };
    },
    onMutate: () => {
      if (isSellerUx) {
        setSellerSaleFlash(null);
      }
      setOperationsQueuedHint(null);
    },
    onSuccess: (data) => {
      if (!data.queued) {
        invalidateDomain();
      }
      if (isSellerUx) {
        setSellerSaleFlash({ ...data, queued: data.queued });
        requestAnimationFrame(() => {
          document.getElementById(sellerFlashDomId)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } else if (data.queued) {
        setOperationsQueuedHint(
          "Нет связи с сервером: продажа сохранена в офлайн-очередь и уйдёт на сервер при появлении сети. Проверьте раздел «Офлайн».",
        );
      }
    },
  });

  return (
    <BirzhaDisclosure
      id={scrollTargetId}
      className={variant === "seller" ? "birzha-seller-sell-panel" : ""}
      defaultOpen
      title={
        <h3 id={headingId} style={{ margin: 0, fontSize: variant === "seller" ? "1.05rem" : "0.98rem" }}>
          {variant === "seller" ? "Продажа с рейса" : "Шаг 2 · Продажа с рейса"}
        </h3>
      }
      hint={variant === "seller" ? "форма" : "после отгрузки"}
    >
      {isSellerUx && sellerSaleFlash ? (
        <div
          id={sellerFlashDomId}
          className="birzha-seller-sale-flash"
          role="status"
          aria-live="assertive"
        >
          <div className="birzha-seller-sale-flash__title">
            {sellerSaleFlash.queued ? "Продажа в очереди" : "Продажа записана"}
          </div>
          <p className="birzha-seller-sale-flash__lead">
            <strong>{sellerSaleFlash.productLine}</strong>
            <span className="birzha-seller-sale-flash__sep"> · </span>
            <span>{sellerSaleFlash.kg} кг</span>
            <span className="birzha-seller-sale-flash__sep"> · </span>
            <span>
              сумма <strong>{sellerSaleFlash.sumRub} ₽</strong>
            </span>
          </p>
          {sellerSaleFlash.queued ? (
            <p className="birzha-seller-sale-flash__meta" style={{ marginTop: "0.35rem" }}>
              Когда появится интернет, запись отправится на сервер автоматически. Статус — в разделе «Офлайн».
            </p>
          ) : null}
          <p className="birzha-seller-sale-flash__meta">Номер в системе: {sellerSaleFlash.saleId}</p>
          <button
            type="button"
            className="birzha-seller-sale-flash__dismiss"
            style={{ ...btnStyle, marginTop: "0.55rem", marginBottom: 0 }}
            onClick={() => setSellerSaleFlash(null)}
          >
            Понятно
          </button>
        </div>
      ) : null}
      {variant === "seller" ? null : (
        <>
          {operationsQueuedHint ? (
            <p className="birzha-callout-info" role="status" style={{ marginBottom: "0.65rem" }}>
              {operationsQueuedHint}
            </p>
          ) : null}
          <p className="birzha-callout-info">Выберите рейс, калибр, тип продажи (розница/опт), кг, цену и оплату.</p>
          {import.meta.env.DEV && (
            <div className="birzha-callout-info" style={{ marginBottom: "0.6rem", fontSize: "0.82rem" }}>
              <BirzhaDisclosure
                nested
                defaultOpen={false}
                title={<span style={{ fontWeight: 600 }}>Технические детали API</span>}
                hint="DEV"
              >
                <p style={{ margin: "0.35rem 0 0", lineHeight: 1.45 }}>
                  <code>POST /api/batches/:batchId/sell-from-trip</code> — поле кг по умолчанию подставляется из остатка
                  «в пути» по партии.
                </p>
              </BirzhaDisclosure>
            </div>
          )}
        </>
      )}

      <span className="birzha-form-label birzha-form-label--block birzha-form-label--mb-xs">Рейс *</span>
      {isSellerUx ? (
        <>
          {sellerTripsListQ.isPending && (
            <p style={{ margin: "0 0 0.5rem" }} role="status">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          )}
          {sellerTripsListQ.isError && (
            <p role="alert" className="birzha-ui-sm birzha-text-danger" style={{ margin: "0 0 0.5rem" }}>
              Не удалось загрузить рейсы. Проверьте связь и повторите.
            </p>
          )}
          {sellerTripsListQ.isSuccess && sellerTripOptions.length === 0 && (
            <div style={{ marginBottom: "0.5rem" }}>
              <BirzhaEmptyState
                compact
                title="Нет закреплённых рейсов"
                description="Обратитесь к администратору — вам нужно назначить рейс в системе."
              />
            </div>
          )}
          {sellerTripsListQ.isSuccess && sellerTripOptions.length > 0 && (
            <select
              id={`${idPrefix}-sel-trip`}
              className={sellerFieldClass}
              value={sellTripId}
              onChange={(e) => {
                const v = e.target.value;
                setSellTripId(v);
                setSellBatchId("");
                setSellKg("");
              }}
              aria-busy={sellerTripsListQ.isFetching || undefined}
              style={sellerFieldMb}
            >
              <option value="">— Выберите рейс —</option>
              {sellerTripOptions.map((t: TripJson) => (
                <option key={t.id} value={t.id}>
                  {formatTripSelectLabel(t)}
                </option>
              ))}
              {sellTripIdTrim &&
              !sellerTripOptions.some((t) => t.id === sellTripIdTrim) ? (
                <option value={sellTripIdTrim}>
                  Рейс (ссылка) {sellTripIdTrim.slice(0, 10)}
                  {sellTripIdTrim.length > 10 ? "…" : ""}
                </option>
              ) : null}
            </select>
          )}
        </>
      ) : (
        <TripSearchPicker
          idPrefix={idPrefix}
          value={sellTripId}
          onChange={(v) => {
            setSellTripId(v);
            setSellBatchId("");
            setSellKg("");
          }}
        />
      )}
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
        <div style={{ marginTop: 0, marginBottom: "0.5rem" }}>
          <BirzhaEmptyState
            compact
            title={
              !tripHasPositiveShipment
                ? isSellerUx
                  ? "Пока нечего продавать: нет отгрузки в рейс"
                  : "Нет отгрузки в рейс или нечего продавать"
                : "На этом рейсе нечего продавать"
            }
            description={
              !tripHasPositiveShipment ? (
                <>
                  Список партий строится по <strong>фактической отгрузке в этот рейс</strong> (кг «в пути» в отчёте).
                  Если рейс привязан к погрузочной накладной в разделе «Погрузка», отгрузка в рейс по строкам накладной
                  создаётся <strong>автоматически</strong> при привязке. Если Погрузки не было, склад оформляет отгрузку
                  вручную: <Link to={routes.ops.operations}>Операции</Link> или <Link to={routes.ops.trips}>Рейсы</Link>.
                </>
              ) : (
                <>
                  По отчёту рейса весь отгруженный товар уже учтён как проданный или как недостача — остатка «в пути»
                  нет.
                </>
              )
            }
          />
        </div>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length > 0 && batchesForTripQuery.isFetching && (
        <p style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.86rem" }} role="status">
          <LoadingIndicator size="sm" label="Загрузка накладных по строкам рейса…" />
        </p>
      )}
      {showBatchListFilter && (
        <>
          <label htmlFor={`${idPrefix}-party-filter`} className="birzha-form-label">
            {isSellerUx ? "Поиск по списку (много позиций)" : "Фильтр списка партий (накладная, калибр, id)"}
          </label>
          <input
            id={`${idPrefix}-party-filter`}
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : { ...fieldStyle, marginBottom: "0.45rem", maxWidth: "100%" }}
            placeholder={isSellerUx ? "Начните вводить калибр или номер накладной…" : "Сузить длинный список…"}
            autoComplete="off"
          />
        </>
      )}
      <label htmlFor={`${idPrefix}-sel-batch`} className="birzha-form-label">
        {isSellerUx ? "Товар и калибр (сколько кг ещё в машине) *" : "Накладная и калибр (кг в машине) *"}
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
        className={sellerFieldClass}
        style={
          isSellerUx
            ? { ...sellerFieldMb, marginBottom: "0.2rem", maxHeight: "min(50vh, 22rem)" }
            : { ...selectWide, marginBottom: "0.2rem", maxHeight: "min(50vh, 22rem)" }
        }
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
          className="birzha-callout-info"
          style={{ fontSize: "0.86rem", marginTop: 0, marginBottom: "0.5rem" }}
          role="status"
          aria-live="polite"
        >
          {isSellerUx ? (
            <>
              <strong>{sellSelectionSummary.line}</strong>
              {sellSelectionSummary.doc !== "—" && (
                <>
                  {" "}
                  (накладная № {sellSelectionSummary.doc})
                </>
              )}
              {". "}
            </>
          ) : (
            <>
              <strong>Накладная № {sellSelectionSummary.doc}</strong> — {sellSelectionSummary.line}
              {". "}
            </>
          )}
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
      {showBatchManualControls && (
        <>
          {isSellerUx ? (
            <BirzhaDisclosure
              nested
              defaultOpen={Boolean(sellTripIdTrim && sellReportQuery.isError)}
              title="Не видно нужный товар в списке?"
              hint="ввод по ID — для поддержки"
              bodyStyle={{ marginBottom: "0.45rem" }}
            >
              <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem", lineHeight: 1.45 }}>
                Обычно достаточно выбрать строку выше. Если список не загрузился или пустой — используйте поля ниже (
                по указанию администратора).
              </p>
              <label htmlFor={`${idPrefix}-in-batch`} className="birzha-form-label">
                ID партии вручную
              </label>
              <input
                id={`${idPrefix}-in-batch`}
                value={sellBatchId}
                onChange={(e) => setSellBatchId(e.target.value)}
                className={sellerFieldClass}
                style={isSellerUx ? sellerFieldMb : fieldStyle}
                autoComplete="off"
                placeholder="полный id партии"
              />
              <label
                htmlFor={`${idPrefix}-batch-id-search`}
                className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm"
              >
                Поиск партии по части id (от 2 символов)
              </label>
              <input
                id={`${idPrefix}-batch-id-search`}
                value={batchIdSearch}
                onChange={(e) => setBatchIdSearch(e.target.value)}
                className={sellerFieldClass}
                style={isSellerUx ? sellerFieldMb : fieldStyle}
                autoComplete="off"
                placeholder="фрагмент id"
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
            </BirzhaDisclosure>
          ) : (
            <>
              <label htmlFor={`${idPrefix}-in-batch`} className="birzha-form-label">
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
              <label
                htmlFor={`${idPrefix}-batch-id-search`}
                className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm"
              >
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
            </>
          )}
        </>
      )}
      <label htmlFor={`${idPrefix}-in-kg`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        {isSellerUx ? "Сколько килограмм в этой сделке *" : "Сколько килограмм в этой продаже *"}
      </label>
      <input
        id={`${idPrefix}-in-kg`}
        value={sellKg}
        onChange={(e) => setSellKg(e.target.value)}
        className={sellerFieldClass}
        style={isSellerUx ? sellerFieldMb : fieldStyle}
        inputMode="decimal"
        autoComplete="off"
      />
      {!isSellerUx && (
        <>
          <label htmlFor={`${idPrefix}-in-sale`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
            Номер продажи (необязательно, иначе система создаст сама)
          </label>
          <input
            id={`${idPrefix}-in-sale`}
            value={saleId}
            onChange={(e) => setSaleId(e.target.value)}
            style={fieldStyle}
            autoComplete="off"
          />
        </>
      )}
      <label htmlFor={`${idPrefix}-in-price`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        Цена за 1 кг, руб *
      </label>
      <input
        id={`${idPrefix}-in-price`}
        value={sellPrice}
        onChange={(e) => setSellPrice(e.target.value)}
        className={sellerFieldClass}
        style={isSellerUx ? sellerFieldMb : fieldStyle}
        inputMode="decimal"
        autoComplete="off"
      />
      <p
        className={isSellerUx ? "birzha-banner-distribution" : "birzha-callout-info"}
        style={{
          marginTop: "0.45rem",
          marginBottom: 0,
          fontSize: isSellerUx ? "1rem" : "0.88rem",
          fontWeight: isSellerUx ? 600 : 400,
          lineHeight: 1.45,
        }}
        role="status"
        aria-live="polite"
        aria-label={sellDealTotalLabel ? `Сумма сделки ${sellDealTotalLabel} рублей` : undefined}
      >
        {sellDealTotalLabel ? (
          <>
            Сумма сделки: <strong>{sellDealTotalLabel} ₽</strong>
            {isSellerUx ? (
              <span className="birzha-text-muted birzha-text-muted--sm" style={{ fontWeight: 500, marginLeft: "0.35rem" }}>
                (кг × цена за кг)
              </span>
            ) : null}
          </>
        ) : (
          <span className="birzha-text-muted">
            Укажите килограммы и цену за кг — здесь появится сумма сделки.
          </span>
        )}
      </p>
      {saleChannel === "retail" && counterpartiesCatalog ? (
        <>
          <label
            htmlFor={`${idPrefix}-sel-cp`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Клиент
          </label>
          <select
            id={`${idPrefix}-sel-cp`}
            value={sellCounterpartyId}
            onChange={(e) => setSellCounterpartyId(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? { ...selectWide, ...sellerFieldMb } : selectWide}
            disabled={counterpartiesQ.isPending}
            aria-busy={counterpartiesQ.isPending || undefined}
          >
            <option value="">
              {counterpartiesQ.isPending ? "— загрузка справочника —" : "— из справочника —"}
            </option>
            {(counterpartiesQ.data?.counterparties ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          <label
            htmlFor={`${idPrefix}-in-new-cp`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Новый в справочнике
          </label>
          {!online ? (
            <p className="birzha-callout-info" style={{ margin: "0 0 0.45rem", fontSize: "0.9rem", lineHeight: 1.45 }}>
              Без сети новую запись в справочник добавить нельзя — выберите из сохранённого списка или введите подпись
              ниже; её можно использовать в продаже офлайн.
            </p>
          ) : null}
          <input
            id={`${idPrefix}-in-new-cp`}
            value={newCounterpartyName}
            onChange={(e) => setNewCounterpartyName(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : fieldStyle}
            placeholder="название для справочника"
            maxLength={200}
            autoComplete="off"
            disabled={!online}
          />
          <button
            type="button"
            style={{ ...btnStyle, marginTop: "0.35rem" }}
            disabled={!online || createCounterparty.isPending}
            onClick={() => createCounterparty.mutate()}
          >
            {createCounterparty.isPending ? "…" : "Добавить в справочник"}
          </button>
          <FieldError error={createCounterparty.error as Error | null} />
          <input
            id={`${idPrefix}-in-client`}
            value={sellClientLabel}
            onChange={(e) => setSellClientLabel(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? { ...sellerFieldMb, marginTop: "0.55rem" } : { ...fieldStyle, marginTop: "0.55rem" }}
            placeholder="Подпись без справочника, напр. ИП Иванов"
            maxLength={120}
            autoComplete="off"
            disabled={Boolean(sellCounterpartyId)}
            aria-label="Подпись клиента для отчёта, если не выбран справочник"
          />
        </>
      ) : saleChannel === "retail" ? (
        <>
          <label
            htmlFor={`${idPrefix}-in-client`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Клиент
          </label>
          <input
            id={`${idPrefix}-in-client`}
            value={sellClientLabel}
            onChange={(e) => setSellClientLabel(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : fieldStyle}
            placeholder="например ИП Иванов"
            maxLength={120}
            autoComplete="off"
            disabled={Boolean(sellCounterpartyId)}
          />
        </>
      ) : null}
      <label htmlFor={`${idPrefix}-sel-sale-ch`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        Тип продажи *
      </label>
      <select
        id={`${idPrefix}-sel-sale-ch`}
        value={saleChannel}
        onChange={(e) => {
          const v = e.target.value as "retail" | "wholesale";
          setSaleChannel(v);
          if (v === "wholesale") {
            setSellCounterpartyId("");
            setSellClientLabel("");
          }
        }}
        className={sellerFieldClass}
        style={isSellerUx ? sellerFieldMb : fieldStyle}
      >
        <option value="retail">Розница</option>
        <option value="wholesale" disabled={!wholesalersCatalog}>
          Опт {!wholesalersCatalog ? "(недоступно)" : ""}
        </option>
      </select>
      {saleChannel === "wholesale" && wholesalersCatalog ? (
        <BirzhaDisclosure
          defaultOpen={isSellerUx}
          title={
            <span className="birzha-form-label" style={{ margin: 0, fontWeight: 600 }}>
              Оптовик *
            </span>
          }
          hint="поиск и выбор"
        >
          <input
            value={wholesalerSearch}
            onChange={(e) => setWholesalerSearch(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? { ...sellerFieldMb, maxWidth: "100%" } : { ...fieldStyle, maxWidth: "100%" }}
            placeholder="Найти по имени…"
            autoComplete="off"
            aria-label="Поиск оптовика"
          />
          {wholesalersQ.isPending ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.35rem 0 0" }}>
              Загрузка списка…
            </p>
          ) : wholesalersQ.isError ? (
            <p style={warnText} role="alert">
              {wholesalersQ.error instanceof Error ? wholesalersQ.error.message : String(wholesalersQ.error)}
            </p>
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "0.45rem 0 0",
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
              }}
            >
              {wholesaleRowsFiltered.length === 0 ? (
                <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
                  Нет совпадений. Добавьте оптовиков в кабинете администратора → «Склады и калибры».
                </li>
              ) : (
                wholesaleRowsFiltered.map((w) => (
                  <li key={w.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <button
                      type="button"
                      onClick={() => setWholesaleBuyerId(w.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.45rem 0.65rem",
                        border: "none",
                        background: wholesaleBuyerId === w.id ? "rgba(0,0,0,0.06)" : "transparent",
                        cursor: "pointer",
                        fontWeight: wholesaleBuyerId === w.id ? 700 : 500,
                        fontSize: "0.9rem",
                      }}
                    >
                      {w.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          {wholesaleBuyerId ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.4rem 0 0" }}>
              Выбрано: <strong>{selectedWholesalerLabel || wholesaleBuyerId}</strong>
            </p>
          ) : (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.4rem 0 0" }}>
              Выберите оптовика из списка.
            </p>
          )}
        </BirzhaDisclosure>
      ) : null}
      <label htmlFor={`${idPrefix}-sel-pay`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        {isSellerUx ? "Как оплачивает клиент *" : "Как оплатил клиент *"}
      </label>
      <select
        id={`${idPrefix}-sel-pay`}
        value={paymentKind}
        onChange={(e) =>
          setPaymentKind(e.target.value as "cash" | "debt" | "mixed" | "card_transfer")
        }
        className={sellerFieldClass}
        style={isSellerUx ? sellerFieldMb : fieldStyle}
      >
        <option value="cash">Наличными целиком</option>
        <option value="debt">В долг целиком (без наличных)</option>
        {!isSellerUx ? (
          <option value="mixed">Смешанно: наличные + долг (укажите нал ниже)</option>
        ) : null}
        <option value="card_transfer">
          {isSellerUx
            ? "Онлайн-перевод на карту + наличные (остаток наличными, не терминал)"
            : "Перевод на карту + наличные (укажите сумму перевода)"}
        </option>
      </select>
      {paymentKind === "card_transfer" && (
        <>
          <label
            htmlFor={`${idPrefix}-in-card-kop`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Сумма онлайн-перевода на карту (копейки, только цифры) *
          </label>
          <input
            id={`${idPrefix}-in-card-kop`}
            value={cardTransferKopecks}
            onChange={(e) => setCardTransferKopecks(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? { ...fieldStyle, ...sellerFieldMb } : fieldStyle}
            placeholder={
              isSellerUx
                ? "например 500000 (= 5000 ₽ переводом); остальное — наличными"
                : "например 75000 (= 750 ₽ переводом); остальное — наличными"
            }
            inputMode="numeric"
            autoComplete="off"
          />
          {isSellerUx ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0 0 0.5rem", lineHeight: 1.45 }}>
              Учёт: банковский перевод клиента на вашу карту (СБП / приложение банка). Не оплата картой через эквайринг.
            </p>
          ) : null}
        </>
      )}
      {paymentKind === "mixed" && (
        <>
          <label
            htmlFor={`${idPrefix}-in-mixed`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
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
      {sell.isSuccess && !isSellerUx && (
        <p style={successText} role="status">
          Готово.
        </p>
      )}
    </BirzhaDisclosure>
  );
}
