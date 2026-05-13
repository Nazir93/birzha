import { purchaseLineAmountKopecksFromDecimalStrings } from "@birzha/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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
import {
  formatSellerCaliberGroupOptionLabel,
  groupSellableRowsByCaliber,
  type SellerCaliberGroup,
} from "../format/seller-trip-caliber-groups.js";
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

  const sellerCaliberGroups = useMemo(
    () => groupSellableRowsByCaliber(sellableOnTripRows, batchByIdForSell),
    [sellableOnTripRows, batchByIdForSell],
  );

  const sellerCaliberGroupsFiltered = useMemo(() => {
    const q = partyFilter.trim().toLowerCase();
    if (!q) {
      return sellerCaliberGroups;
    }
    return sellerCaliberGroups.filter((g) => {
      const opt = formatSellerCaliberGroupOptionLabel(g, gramsBigIntToKgDecimalString).toLowerCase();
      return opt.includes(q) || g.rows.some((r) => r.batchId.toLowerCase().includes(q));
    });
  }, [sellerCaliberGroups, partyFilter]);

  const sellBatchSelectDisabled = useMemo(
    () =>
      !sellTripIdTrim ||
      (Boolean(sellTripIdTrim) && !sellReportQuery.isFetched) ||
      (sellReportQuery.isSuccess && sellableOnTripRows.length === 0) ||
      (sellReportQuery.isFetched && sellReportQuery.isError) ||
      (batchIdsOnTrip.length > 0 && batchesForTripQuery.isPending),
    [
      sellTripIdTrim,
      sellReportQuery.isFetched,
      sellReportQuery.isSuccess,
      sellReportQuery.isError,
      sellableOnTripRows.length,
      batchIdsOnTrip.length,
      batchesForTripQuery.isPending,
    ],
  );

  const applySellerCaliberGroup = useCallback(
    (g: SellerCaliberGroup) => {
      setSellBatchId(g.primaryBatchId);
      const row = sellableOnTripRows.find((r) => r.batchId === g.primaryBatchId);
      if (row) {
        setSellKg(gramsBigIntToKgDecimalString(g.rows.length <= 1 ? g.totalNetG : row.netTransitG));
      }
    },
    [sellableOnTripRows],
  );

  const sellerCaliberGridStatusMessage = useMemo(() => {
    if (!sellTripIdTrim) {
      return "Сначала выберите рейс.";
    }
    if (!sellReportQuery.isFetched) {
      return "Загрузка остатков…";
    }
    if (sellReportQuery.isError) {
      return "Список недоступен — укажите ID партии вручную.";
    }
    if (sellReportQuery.isSuccess && sellableOnTripRows.length === 0) {
      return "Нечего продавать по этому рейсу.";
    }
    if (batchIdsOnTrip.length > 0 && batchesForTripQuery.isPending) {
      return "Загрузка партий…";
    }
    return "";
  }, [
    sellTripIdTrim,
    sellReportQuery.isFetched,
    sellReportQuery.isError,
    sellReportQuery.isSuccess,
    sellableOnTripRows.length,
    batchIdsOnTrip.length,
    batchesForTripQuery.isPending,
  ]);

  const sellerMultiBatchGroup = useMemo(() => {
    if (!isSellerUx || !sellBatchId.trim()) {
      return null;
    }
    const id = sellBatchId.trim();
    return sellerCaliberGroups.find((g) => g.primaryBatchId === id && g.rows.length > 1) ?? null;
  }, [isSellerUx, sellBatchId, sellerCaliberGroups]);

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
    (isSellerUx ? sellerCaliberGroups.length > 8 : true);

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
        setOperationsQueuedHint("Офлайн: продажа в очереди.");
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
              Офлайн — отправится при сети.
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
        </>
      )}

      {isSellerUx ? (
        <section
          className="birzha-seller-deal-kind"
          aria-labelledby={`${idPrefix}-deal-kind-h`}
          style={{ marginBottom: "0.9rem" }}
        >
          <h4 id={`${idPrefix}-deal-kind-h`} className="birzha-seller-label" style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>
            Сначала выберите тип сделки
          </h4>
          <div className="birzha-seller-channel-pills" role="group" aria-label="Розница или опт">
            <button
              type="button"
              className={`birzha-seller-channel-pills__btn${saleChannel === "retail" ? " birzha-seller-channel-pills__btn--active" : ""}`}
              aria-pressed={saleChannel === "retail"}
              onClick={() => {
                setSaleChannel("retail");
                setWholesaleBuyerId("");
                setWholesalerSearch("");
              }}
            >
              Розница
            </button>
            <button
              type="button"
              className={`birzha-seller-channel-pills__btn${saleChannel === "wholesale" ? " birzha-seller-channel-pills__btn--active" : ""}`}
              aria-pressed={saleChannel === "wholesale"}
              disabled={!wholesalersCatalog}
              title={
                wholesalersCatalog ? undefined : "Опт недоступен"
              }
              onClick={() => {
                if (!wholesalersCatalog) {
                  return;
                }
                setSaleChannel("wholesale");
                setSellCounterpartyId("");
                setSellClientLabel("");
                setNewCounterpartyName("");
              }}
            >
              Опт
            </button>
          </div>
          {!wholesalersCatalog ? (
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.45rem 0 0" }}>
              Опт недоступен — розница.
            </p>
          ) : null}
          {saleChannel === "retail" ? (
            <div style={{ marginTop: "0.85rem" }} role="region" aria-labelledby={`${idPrefix}-buyer-h`}>
              <span id={`${idPrefix}-buyer-h`} className="birzha-form-label birzha-form-label--block" style={{ marginBottom: "0.35rem" }}>
                Кому продаёте *
              </span>
              {counterpartiesCatalog ? (
                <>
                  <label htmlFor={`${idPrefix}-sel-cp-seller`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm">
                    Из справочника
                  </label>
                  <select
                    id={`${idPrefix}-sel-cp-seller`}
                    value={sellCounterpartyId}
                    onChange={(e) => setSellCounterpartyId(e.target.value)}
                    className={sellerFieldClass}
                    style={{ ...selectWide, ...sellerFieldMb }}
                    disabled={counterpartiesQ.isPending}
                    aria-busy={counterpartiesQ.isPending || undefined}
                  >
                    <option value="">
                      {counterpartiesQ.isPending ? "— загрузка справочника —" : "— выберите контрагента —"}
                    </option>
                    {(counterpartiesQ.data?.counterparties ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
                  <label htmlFor={`${idPrefix}-in-new-cp-seller`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm">
                    Новый в справочнике
                  </label>
                  {!online ? (
                    <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.45rem" }}>
                      Без сети — только список или подпись ниже.
                    </p>
                  ) : null}
                  <input
                    id={`${idPrefix}-in-new-cp-seller`}
                    value={newCounterpartyName}
                    onChange={(e) => setNewCounterpartyName(e.target.value)}
                    className={sellerFieldClass}
                    style={sellerFieldMb}
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
                  <label htmlFor={`${idPrefix}-in-client-seller`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm">
                    Подпись в отчёт (если не из справочника)
                  </label>
                  <input
                    id={`${idPrefix}-in-client-seller`}
                    value={sellClientLabel}
                    onChange={(e) => setSellClientLabel(e.target.value)}
                    className={sellerFieldClass}
                    style={sellerFieldMb}
                    placeholder="например ИП Иванов"
                    maxLength={120}
                    autoComplete="off"
                    disabled={Boolean(sellCounterpartyId)}
                  />
                </>
              ) : (
                <>
                  <label htmlFor={`${idPrefix}-in-client-seller`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-sm">
                    Клиент (подпись в отчёт)
                  </label>
                  <input
                    id={`${idPrefix}-in-client-seller`}
                    value={sellClientLabel}
                    onChange={(e) => setSellClientLabel(e.target.value)}
                    className={sellerFieldClass}
                    style={sellerFieldMb}
                    placeholder="например ИП Иванов"
                    maxLength={120}
                    autoComplete="off"
                  />
                </>
              )}
            </div>
          ) : wholesalersCatalog ? (
            <div style={{ marginTop: "0.85rem" }} role="region" aria-labelledby={`${idPrefix}-wholesale-h`}>
              <span id={`${idPrefix}-wholesale-h`} className="birzha-form-label birzha-form-label--block" style={{ marginBottom: "0.35rem" }}>
                Оптовик *
              </span>
              <input
                value={wholesalerSearch}
                onChange={(e) => setWholesalerSearch(e.target.value)}
                className={sellerFieldClass}
                style={{ ...sellerFieldMb, maxWidth: "100%" }}
                placeholder="Найти по названию…"
                autoComplete="off"
                aria-label="Поиск оптовика"
              />
              {wholesalersQ.isPending ? (
                <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.35rem 0 0" }}>
                  Загрузка списка оптовиков…
                </p>
              ) : wholesalersQ.isError ? (
                <p style={warnText} role="alert">
                  {wholesalersQ.error instanceof Error ? wholesalersQ.error.message : String(wholesalersQ.error)}
                </p>
              ) : (
                <ul className="birzha-seller-wholesaler-list" aria-label="Наши оптовики">
                  {wholesaleRowsFiltered.length === 0 ? (
                    <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
                      Нет совпадений.
                    </li>
                  ) : (
                    wholesaleRowsFiltered.map((w) => (
                      <li key={w.id} className="birzha-seller-wholesaler-list__item">
                        <button
                          type="button"
                          onClick={() => setWholesaleBuyerId(w.id)}
                          className={
                            wholesaleBuyerId === w.id
                              ? "birzha-seller-wholesaler-list__pick birzha-seller-wholesaler-list__pick--active"
                              : "birzha-seller-wholesaler-list__pick"
                          }
                        >
                          {w.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {wholesaleBuyerId ? (
                <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.45rem 0 0" }}>
                  <strong>{selectedWholesalerLabel || wholesaleBuyerId}</strong>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

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
              Рейсы не загрузились.
            </p>
          )}
          {sellerTripsListQ.isSuccess && sellerTripOptions.length === 0 && (
            <div style={{ marginBottom: "0.5rem" }}>
              <BirzhaEmptyState compact title="Нет закреплённых рейсов" />
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
          Ошибка отчёта по рейсу. Ниже — ID партии вручную.
        </p>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length === 0 && (
        <div style={{ marginTop: 0, marginBottom: "0.5rem" }}>
          <BirzhaEmptyState
            compact
            title={
              !tripHasPositiveShipment
                ? isSellerUx
                  ? "Нет отгрузки в рейс"
                  : "Нет отгрузки в рейс"
                : "Нечего продавать"
            }
          />
        </div>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length > 0 && batchesForTripQuery.isFetching && (
        <p style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.86rem" }} role="status">
          <LoadingIndicator
            size="sm"
            label={isSellerUx ? "Загрузка калибров и накладных…" : "Загрузка накладных по строкам рейса…"}
          />
        </p>
      )}
      {showBatchListFilter && (
        <>
          <label htmlFor={`${idPrefix}-party-filter`} className="birzha-form-label">
            {isSellerUx ? "Поиск по калибру или id партии" : "Фильтр списка партий (накладная, калибр, id)"}
          </label>
          <input
            id={`${idPrefix}-party-filter`}
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : { ...fieldStyle, marginBottom: "0.45rem", maxWidth: "100%" }}
            placeholder={isSellerUx ? "Калибр или id партии…" : "Сузить длинный список…"}
            autoComplete="off"
          />
        </>
      )}
      {isSellerUx ? (
        <fieldset
          className="birzha-seller-caliber-fieldset"
          style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}
        >
          <legend className="birzha-form-label" style={{ padding: 0, marginBottom: "0.35rem" }}>
            Калибр и остаток в машине *
          </legend>
          {sellBatchSelectDisabled ? (
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
              {sellerCaliberGridStatusMessage}
            </p>
          ) : (
            <>
              {sellerCaliberGroupsFiltered.length === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
                  {sellerCaliberGroups.length > 0 ? "Нет совпадений по поиску." : "Нет строк."}
                </p>
              ) : (
                <div
                  className="birzha-seller-caliber-grid"
                  role="listbox"
                  aria-label="Калибр и остаток в машине"
                  id={`${idPrefix}-sel-batch`}
                >
                  {sellerCaliberGroupsFiltered.map((g) => {
                    const selected = sellBatchId === g.primaryBatchId;
                    const kgLine = gramsBigIntToKgDecimalString(g.totalNetG);
                    return (
                      <button
                        key={g.primaryBatchId}
                        type="button"
                        className={
                          selected
                            ? "birzha-seller-caliber-tile birzha-seller-caliber-tile--selected"
                            : "birzha-seller-caliber-tile"
                        }
                        role="option"
                        aria-selected={selected}
                        onClick={() => applySellerCaliberGroup(g)}
                      >
                        <span className="birzha-seller-caliber-tile__line">{g.lineLabel}</span>
                        <span className="birzha-seller-caliber-tile__kg">{kgLine} кг</span>
                        {g.rows.length > 1 ? (
                          <span className="birzha-seller-caliber-tile__meta">{g.rows.length} партии</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </fieldset>
      ) : (
        <>
          <label htmlFor={`${idPrefix}-sel-batch`} className="birzha-form-label">
            Накладная и калибр (кг в машине) *
          </label>
          <select
            id={`${idPrefix}-sel-batch`}
            value={sellBatchId}
            onChange={(e) => {
              const id = e.target.value;
              setSellBatchId(id);
              if (!id.trim()) {
                setSellKg("");
                return;
              }
              const row = sellableOnTripRows.find((r) => r.batchId === id);
              if (row) {
                setSellKg(gramsBigIntToKgDecimalString(row.netTransitG));
              }
            }}
            className={sellerFieldClass}
            style={{ ...selectWide, marginBottom: "0.2rem", maxHeight: "min(50vh, 22rem)" }}
            disabled={sellBatchSelectDisabled}
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
        </>
      )}
      {isSellerUx && sellerMultiBatchGroup ? (
        <p
          className="birzha-callout-info"
          style={{ fontSize: "0.86rem", marginTop: "0.35rem", marginBottom: "0.45rem", lineHeight: 1.45 }}
          role="status"
        >
          Несколько партий по калибру — до{" "}
          <strong>{gramsBigIntToKgDecimalString(sellerMultiBatchGroup.primaryRow.netTransitG)} кг</strong> за сделку.
        </p>
      ) : null}
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
              · <strong>≈ {String(sellSelectionSummary.estPkg)} ящ</strong>
            </>
          )}
          {sellSelectionSummary.subUnitPackages && <> · &lt; 1 ящ</>}
        </p>
      )}
      {showBatchManualControls && (
        <>
          {isSellerUx ? (
            <BirzhaDisclosure
              nested
              defaultOpen={Boolean(sellTripIdTrim && sellReportQuery.isError)}
              title="ID партии вручную"
              bodyStyle={{ marginBottom: "0.45rem" }}
            >
              <label htmlFor={`${idPrefix}-in-batch`} className="birzha-form-label">
                ID партии
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
        aria-label={sellDealTotalLabel ? `Сумма ${sellDealTotalLabel} ₽` : undefined}
      >
        {sellDealTotalLabel ? (
          <>
            Сумма: <strong>{sellDealTotalLabel} ₽</strong>
          </>
        ) : (
          <span className="birzha-text-muted">—</span>
        )}
      </p>
      {!isSellerUx && saleChannel === "retail" && counterpartiesCatalog ? (
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
            style={selectWide}
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
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.45rem" }}>
              Без сети — только список или подпись ниже.
            </p>
          ) : null}
          <input
            id={`${idPrefix}-in-new-cp`}
            value={newCounterpartyName}
            onChange={(e) => setNewCounterpartyName(e.target.value)}
            className={sellerFieldClass}
            style={fieldStyle}
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
            style={{ ...fieldStyle, marginTop: "0.55rem" }}
            placeholder="Подпись без справочника, напр. ИП Иванов"
            maxLength={120}
            autoComplete="off"
            disabled={Boolean(sellCounterpartyId)}
            aria-label="Подпись клиента для отчёта, если не выбран справочник"
          />
        </>
      ) : !isSellerUx && saleChannel === "retail" ? (
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
            style={fieldStyle}
            placeholder="например ИП Иванов"
            maxLength={120}
            autoComplete="off"
            disabled={Boolean(sellCounterpartyId)}
          />
        </>
      ) : null}
      {!isSellerUx ? (
        <>
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
            style={fieldStyle}
          >
            <option value="retail">Розница</option>
            <option value="wholesale" disabled={!wholesalersCatalog}>
              Опт {!wholesalersCatalog ? "(недоступно)" : ""}
            </option>
          </select>
        </>
      ) : null}
      {!isSellerUx && saleChannel === "wholesale" && wholesalersCatalog ? (
        <BirzhaDisclosure
          defaultOpen
          title={
            <span className="birzha-form-label" style={{ margin: 0, fontWeight: 600 }}>
              Оптовик *
            </span>
          }
        >
          <input
            value={wholesalerSearch}
            onChange={(e) => setWholesalerSearch(e.target.value)}
            className={sellerFieldClass}
            style={{ ...fieldStyle, maxWidth: "100%" }}
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
                  Нет совпадений.
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
              <strong>{selectedWholesalerLabel || wholesaleBuyerId}</strong>
            </p>
          ) : null}
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
