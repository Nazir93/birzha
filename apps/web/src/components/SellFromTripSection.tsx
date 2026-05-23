import {
  nonnegativeDecimalStringToNumber,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "@birzha/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiPostJson } from "../api/fetch-api.js";
import { isLikelyNetworkOrOfflineFailure } from "../api/is-network-or-offline-failure.js";
import type { BatchListItem, TripJson } from "../api/types.js";
import { formatNakladLineLabel } from "../format/batch-label.js";
import {
  findSellerCaliberGroupForBatch,
  groupSellableRowsByCaliber,
  kgNumberToGramsBigInt,
  maxSellableGramsForBatch,
  maxSellablePackagesForBatch,
  sellerCaliberGroupKey,
} from "../format/seller-trip-caliber-groups.js";
import { buildSellerSellChunks } from "../format/seller-sell-chunk-plan.js";
import { randomUuid } from "../lib/random-uuid.js";
import { formatTripSelectLabel } from "../format/trip-label.js";
import { sortTripsByTripNumberAsc } from "../format/trip-sort.js";
import { TRIP_STATUS_CLOSED, isTripOpenForSellerWorkspace } from "../format/seller-workspace-trips.js";
import {
  buildTripBatchRows,
  estimateNetTransitPackageCountForSell,
  rowUsesPackageAccountingForSell,
  type TripBatchTableRow,
} from "../format/trip-report-rows.js";
import { useAuth } from "../auth/auth-context.js";
import { useNavigatorOnLine } from "../hooks/useNavigatorOnLine.js";
import {
  batchesByIdsQueryOptions,
  counterpartiesFullListQueryOptions,
  queryRoots,
  shipmentReportQueryOptions,
  tripsFullListQueryOptions,
  wholesalersFullListQueryOptions,
} from "../query/core-list-queries.js";
import { kopecksToRubLabel } from "../format/money.js";
import { parseSellFromTripForm } from "../validation/api-schemas.js";
import { BirzhaDisclosure } from "../ui/BirzhaDisclosure.js";
import { BirzhaEmptyState } from "../ui/BirzhaEmptyState.js";
import { SellerTripSaleCorrections } from "./SellerTripSaleCorrections.js";
import { TripSearchPicker } from "./TripSearchPicker.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { btnStyle, fieldStyle, successText, warnText } from "../ui/styles.js";

const selectWide = { ...fieldStyle, maxWidth: "100%" as const };

/** У продавца: не больше N строк в списке; при большем справочнике — фильтр по поиску. */
const WHOLESALER_SELLER_MAX_ROWS = 80;

type WholesalerListItem = { id: string; name: string; isActive: boolean };

function filterWholesalersForSellerPicker(
  active: WholesalerListItem[],
  search: string,
  selectedId: string,
): { rows: WholesalerListItem[]; truncated: boolean; totalMatched: number } {
  const q = search.trim().toLowerCase();
  const matched = q ? active.filter((w) => w.name.toLowerCase().includes(q)) : active;
  const totalMatched = matched.length;
  let rows = totalMatched > WHOLESALER_SELLER_MAX_ROWS ? matched.slice(0, WHOLESALER_SELLER_MAX_ROWS) : matched;
  const sel = selectedId ? active.find((w) => w.id === selectedId) : undefined;
  if (sel && !rows.some((r) => r.id === sel.id)) {
    rows = [sel, ...rows];
  }
  return { rows, truncated: totalMatched > WHOLESALER_SELLER_MAX_ROWS, totalMatched };
}

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
    void queryClient.invalidateQueries({ queryKey: queryRoots.tripSaleLines });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
  };

  const counterpartiesCatalog = meta?.counterpartyCatalogApi === "enabled";
  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const counterpartiesQ = useQuery({
    ...counterpartiesFullListQueryOptions(),
    /** Розница у полевого продавца — без справочника контрагентов в UI. */
    enabled: counterpartiesCatalog && !isSellerUx,
  });
  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled: wholesalersCatalog,
  });

  const [sellBatchId, setSellBatchId] = useState("");
  const [sellTripId, setSellTripId] = useState("");
  const [sellKg, setSellKg] = useState("");
  const [sellPackages, setSellPackages] = useState("");
  const [saleId, setSaleId] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [saleChannel, setSaleChannel] = useState<"retail" | "wholesale">("retail");
  const [wholesaleBuyerId, setWholesaleBuyerId] = useState("");
  const [wholesalerSearch, setWholesalerSearch] = useState("");
  const wholesalerSearchDebounced = useDebouncedValue(wholesalerSearch, 220);
  const [paymentKind, setPaymentKind] = useState<"cash" | "debt" | "mixed" | "card_transfer">("cash");
  const sellerFieldClass = isSellerUx ? "birzha-seller-form-control" : undefined;
  const sellerFieldMb = { marginBottom: "0.45rem" as const, maxWidth: "100%" as const };
  const [cashMixed, setCashMixed] = useState("");
  const [cardTransferKopecks, setCardTransferKopecks] = useState("");
  const [sellClientLabel, setSellClientLabel] = useState("");
  const [sellCounterpartyId, setSellCounterpartyId] = useState("");
  const [newCounterpartyName, setNewCounterpartyName] = useState("");
  const [partyFilter, setPartyFilter] = useState("");
  /** Ключ выбранной плитки калибра (группа партий, как в погрузочной накладной). */
  const [sellCaliberKey, setSellCaliberKey] = useState<string | null>(null);

  const sellerFlashDomId = `${idPrefix}-sale-flash`;
  const [sellerSaleFlash, setSellerSaleFlash] = useState<{
    kg: string;
    packages: string | null;
    sumRub: string;
    productLine: string;
  } | null>(null);

  const sellerTripsListQ = useQuery({
    ...tripsFullListQueryOptions(),
    enabled: isSellerUx,
  });

  useEffect(() => {
    setSellerSaleFlash(null);
  }, [sellTripId, sellBatchId]);

  useEffect(() => {
    const p = searchParams.get("trip")?.trim() ?? "";
    if (!p) {
      return;
    }
    if (isSellerUx) {
      const raw = sellerTripsListQ.data?.trips ?? [];
      const tripRow = raw.find((x) => x.id === p);
      if (tripRow && tripRow.status === TRIP_STATUS_CLOSED) {
        return;
      }
    }
    setSellTripId(p);
    setSellBatchId("");
    setSellKg("");
    setSellPackages("");
  }, [searchParams, isSellerUx, sellerTripsListQ.data?.trips]);

  /** Рейс закрыт в админке — сбрасываем выбор и URL, чтобы кабинет «очистился». */
  useEffect(() => {
    if (!isSellerUx) {
      return;
    }
    const id = sellTripId.trim();
    if (!id) {
      return;
    }
    const t = (sellerTripsListQ.data?.trips ?? []).find((x) => x.id === id);
    if (!t || t.status !== TRIP_STATUS_CLOSED) {
      return;
    }
    setSellTripId("");
    setSellBatchId("");
    setSellCaliberKey(null);
    setSellKg("");
    setSellPackages("");
    const next = new URLSearchParams(searchParams);
    next.delete("trip");
    const qs = next.toString();
    void navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [isSellerUx, sellTripId, sellerTripsListQ.data?.trips, searchParams, navigate, location.pathname]);

  /** Один открытый закреплённый рейс — сразу подставляем (меньше шагов для продавца). */
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
    const list = (sellerTripsListQ.data?.trips ?? []).filter(isTripOpenForSellerWorkspace);
    if (list.length !== 1) {
      return;
    }
    setSellTripId(list[0]!.id);
  }, [isSellerUx, searchParams, sellTripId, sellerTripsListQ.data?.trips]);

  useEffect(() => {
    setPartyFilter("");
    setSellCaliberKey(null);
  }, [sellTripId]);

  useEffect(() => {
    if (saleChannel === "retail") {
      setWholesaleBuyerId("");
      setWholesalerSearch("");
      if (isSellerUx) {
        setSellCounterpartyId("");
        setSellClientLabel("");
        setNewCounterpartyName("");
      }
    } else {
      setSellCounterpartyId("");
    }
  }, [saleChannel, isSellerUx]);

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
    () => sortTripsByTripNumberAsc(sellerTripsListQ.data?.trips ?? []).filter(isTripOpenForSellerWorkspace),
    [sellerTripsListQ.data?.trips],
  );

  const sellerHasAssignedClosedOnly = useMemo(() => {
    if (!isSellerUx) {
      return false;
    }
    const all = sellerTripsListQ.data?.trips ?? [];
    if (all.length === 0) {
      return false;
    }
    return all.every((t) => !isTripOpenForSellerWorkspace(t));
  }, [isSellerUx, sellerTripsListQ.data?.trips]);

  const sellTripIdTrim = sellTripId.trim();
  const selectedTripOpen = useMemo(() => {
    if (!isSellerUx || !sellTripIdTrim) {
      return true;
    }
    const t = (sellerTripsListQ.data?.trips ?? []).find((x) => x.id === sellTripIdTrim);
    return t ? isTripOpenForSellerWorkspace(t) : true;
  }, [isSellerUx, sellTripIdTrim, sellerTripsListQ.data?.trips]);
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
    const line = b ? formatNakladLineLabel(b) : "партия без накладной";
    const docNum = b?.nakladnaya?.documentNumber?.trim();
    const prefix = includeNakladPrefix && docNum ? `№ ${docNum} · ` : "";
    const kg = gramsBigIntToKgDecimalString(row.netTransitG);
    const estPkg = estimateNetTransitPackageCountForSell(row, b);
    const usesPkg = rowUsesPackageAccountingForSell(row, b);
    if (usesPkg && estPkg > 0n) {
      return `${prefix}${line} — ${kg} кг · ≈${estPkg} ящ в пути`;
    }
    if (usesPkg && row.netTransitG > 0n && estPkg === 0n) {
      return `${prefix}${line} — ${kg} кг · <1 ящ в пути (оцен.)`;
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
        const optgroupLabel = docNum ? `Накладная № ${docNum}` : "Без номера накладной";
        m.set(key, {
          key,
          optgroupLabel,
          sortKey: docNum || optgroupLabel,
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
          const la = ba ? formatNakladLineLabel(ba) : "—";
          const lc = bc ? formatNakladLineLabel(bc) : "—";
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

  /** Плитки продавца: один калибр = одна строка (как «по калибрам» в погрузочной накладной). */
  const sellerTripSellTiles = useMemo(() => {
    const groups = groupSellableRowsByCaliber(sellableOnTripRows, batchByIdForSell);
    return groups.map((group) => {
      const sampleBatch = batchByIdForSell.get(group.primaryBatchId);
      const key = sellerCaliberGroupKey(sampleBatch, group.primaryRow);
      return {
        key,
        group,
        headline: group.lineLabel,
        totalNetG: group.totalNetG,
      };
    });
  }, [sellableOnTripRows, batchByIdForSell]);

  const sellerTripSellTilesFiltered = useMemo(() => {
    const q = partyFilter.trim().toLowerCase();
    if (!q) {
      return sellerTripSellTiles;
    }
    return sellerTripSellTiles.filter((t) => t.headline.toLowerCase().includes(q));
  }, [sellerTripSellTiles, partyFilter]);

  const selectedSellerCaliberGroup = useMemo(
    () => findSellerCaliberGroupForBatch(sellBatchId, sellableOnTripRows, batchByIdForSell),
    [sellBatchId, sellableOnTripRows, batchByIdForSell],
  );

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

  const applySellerCaliberTile = useCallback((tile: (typeof sellerTripSellTiles)[number]) => {
    setSellCaliberKey(tile.key);
    setSellBatchId(tile.group.primaryBatchId);
    setSellKg(gramsBigIntToKgDecimalString(tile.group.totalNetG));
    const estPkg = tile.group.rows.reduce(
      (s, r) => s + estimateNetTransitPackageCountForSell(r, batchByIdForSell.get(r.batchId)),
      0n,
    );
    setSellPackages(estPkg > 0n ? String(estPkg) : "");
  }, []);

  const clearSellerSaleInputs = useCallback(() => {
    setSellBatchId("");
    setSellCaliberKey(null);
    setSellKg("");
    setSellPackages("");
    setSellPrice("");
    setSaleId("");
    setCashMixed("");
    setCardTransferKopecks("");
    setSellClientLabel("");
    setSellCounterpartyId("");
    setNewCounterpartyName("");
    setWholesaleBuyerId("");
    setWholesalerSearch("");
    setSaleChannel("retail");
    setPaymentKind("cash");
  }, []);

  const sellerCaliberGridStatusMessage = useMemo(() => {
    if (!sellTripIdTrim) {
      return "Сначала выберите рейс.";
    }
    if (!sellReportQuery.isFetched) {
      return "Загрузка остатков…";
    }
    if (sellReportQuery.isError) {
      return "Список недоступен — повторите позже или обратитесь к администратору.";
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

  const activeWholesalers = useMemo(
    () => (wholesalersQ.data?.wholesalers ?? []).filter((w) => w.isActive),
    [wholesalersQ.data?.wholesalers],
  );

  const wholesalerPickerFiltered = useMemo(() => {
    const qSource = isSellerUx ? wholesalerSearchDebounced : wholesalerSearch;
    if (isSellerUx) {
      return filterWholesalersForSellerPicker(activeWholesalers, qSource, wholesaleBuyerId);
    }
    const q = qSource.trim().toLowerCase();
    const matched = q ? activeWholesalers.filter((w) => w.name.toLowerCase().includes(q)) : activeWholesalers;
    return { rows: matched, truncated: false, totalMatched: matched.length };
  }, [
    activeWholesalers,
    wholesalerSearch,
    wholesalerSearchDebounced,
    isSellerUx,
    wholesaleBuyerId,
  ]);

  const wholesaleRowsFiltered = wholesalerPickerFiltered.rows;

  const selectedWholesalerLabel = useMemo(() => {
    if (!wholesaleBuyerId) {
      return "";
    }
    const w = (wholesalersQ.data?.wholesalers ?? []).find((x) => x.id === wholesaleBuyerId);
    return w?.name ?? "";
  }, [wholesaleBuyerId, wholesalersQ.data?.wholesalers]);

  /** Фильтр списка партий — в кабинете продавца не показываем (выбор по плиткам калибра + прокрутка). */
  const showBatchListFilter =
    !isSellerUx &&
    Boolean(sellTripIdTrim) &&
    sellReportQuery.isSuccess &&
    sellableOnTripRows.length > 0;

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
    const group = selectedSellerCaliberGroup;
    const row =
      group?.rows.find((r) => r.batchId === sellBatchId) ??
      sellableOnTripRows.find((r) => r.batchId === sellBatchId);
    if (!row) {
      return null;
    }
    const netG = group?.totalNetG ?? row.netTransitG;
    const b = batchByIdForSell.get(row.batchId);
    const estPkg = group
      ? group.rows.reduce(
          (s, r) => s + estimateNetTransitPackageCountForSell(r, batchByIdForSell.get(r.batchId)),
          0n,
        )
      : estimateNetTransitPackageCountForSell(row, b);
    const hasPkgData = group
      ? group.rows.some((r) => rowUsesPackageAccountingForSell(r, batchByIdForSell.get(r.batchId)))
      : rowUsesPackageAccountingForSell(row, b);
    return {
      line: group?.lineLabel ?? (b ? formatNakladLineLabel(b) : "—"),
      doc: b?.nakladnaya?.documentNumber?.trim() ?? "—",
      kg: gramsBigIntToKgDecimalString(netG),
      estPkg,
      hasShipped: group ? group.rows.some((r) => r.shippedG > 0n) : row.shippedG > 0n,
      hasPkgData,
      subUnitPackages: hasPkgData && netG > 0n && estPkg === 0n,
    };
  }, [sellBatchId, sellableOnTripRows, batchByIdForSell, selectedSellerCaliberGroup]);

  /** Блок «Зафиксировать» у продавца: опт без выбора, сумма карты, лимит к выручке. */
  const sellerSellBlockReason = useMemo(() => {
    if (!isSellerUx) {
      return null;
    }
    if (saleChannel === "wholesale") {
      if (!wholesalersCatalog) {
        return null;
      }
      if (wholesalersQ.isPending) {
        return "Подождите загрузку списка оптовиков";
      }
      if (!wholesaleBuyerId.trim()) {
        if (wholesalersQ.isSuccess && activeWholesalers.length === 0) {
          return "Нет активных оптовиков — администратор должен добавить их в справочнике (Инвентарь)";
        }
        return "Выберите оптовика из списка";
      }
    }
    if (paymentKind === "card_transfer") {
      const raw = cardTransferKopecks.trim();
      if (!raw) {
        return "Укажите сумму перевода на карту (рубли)";
      }
      const rub = nonnegativeDecimalStringToNumber(raw, 2);
      if (!Number.isFinite(rub) || rub < 0) {
        return "Сумма перевода: рубли, например 4950 или 4950,50";
      }
      const totalK = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, { kgMaxFrac: 6, priceMaxFrac: 4 });
      if (Number.isFinite(totalK) && totalK >= 0) {
        const cardK = Math.round(rub * 100);
        if (cardK <= 0) {
          return "Сумма перевода на карту должна быть больше нуля";
        }
        if (cardK > totalK) {
          return "Сумма перевода не больше выручки по строке (кг × цена)";
        }
      }
    }
    if (paymentKind === "mixed") {
      const raw = cashMixed.trim();
      if (!raw) {
        return isSellerUx
          ? "Укажите сумму наличными при смешанной оплате (рубли)"
          : "Укажите сумму наличными (копейки в поле ниже)";
      }
      if (isSellerUx) {
        const rub = nonnegativeDecimalStringToNumber(raw, 2);
        if (!Number.isFinite(rub) || rub < 0) {
          return "Сумма наличными: рубли, например 1500 или 1500,50";
        }
        const totalK = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, { kgMaxFrac: 6, priceMaxFrac: 4 });
        if (Number.isFinite(totalK) && totalK >= 0) {
          const cashK = Math.round(rub * 100);
          if (cashK > totalK) {
            return "Наличная часть не больше выручки по строке (кг × цена)";
          }
          if (cashK <= 0) {
            return "Сумма наличными больше нуля — иначе выберите «В долг целиком»";
          }
          if (cashK >= totalK) {
            return "Должна остаться часть в долг — уменьшите наличные или выберите «Наличными целиком»";
          }
        }
      }
    }
    if (sellBatchId.trim() && sellKg.trim()) {
      const kgNum = Number(sellKg.replace(",", "."));
      if (Number.isFinite(kgNum) && kgNum > 0) {
        const maxG = maxSellableGramsForBatch(sellBatchId, sellableOnTripRows, batchByIdForSell);
        if (kgNumberToGramsBigInt(kgNum) > maxG) {
          return `Не больше ${gramsBigIntToKgDecimalString(maxG)} кг в машине по выбранному калибру`;
        }
      }
    }
    if (!sellBatchId.trim()) {
      return "Выберите калибр на рейсе";
    }
    if (!sellKg.trim()) {
      return "Укажите кг продажи";
    }
    if (sellSelectionSummary?.hasPkgData) {
      const raw = sellPackages.trim();
      if (!raw) {
        return "Укажите количество ящиков в продаже";
      }
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) {
        return "Ящики: целое неотрицательное число";
      }
      if (n <= 0) {
        return "Количество ящиков должно быть больше нуля";
      }
      if (sellBatchId.trim()) {
        const maxPkg = maxSellablePackagesForBatch(sellBatchId, sellableOnTripRows, batchByIdForSell);
        if (BigInt(n) > maxPkg) {
          return `Не больше ${String(maxPkg)} ящ. в машине по выбранному калибру`;
        }
      }
    }
    if (!sellPrice.trim()) {
      return "Укажите цену за кг";
    }
    return null;
  }, [
    isSellerUx,
    saleChannel,
    wholesalersCatalog,
    wholesalersQ.isPending,
    wholesalersQ.isSuccess,
    wholesaleBuyerId,
    activeWholesalers.length,
    paymentKind,
    cardTransferKopecks,
    cashMixed,
    sellKg,
    sellPackages,
    sellPrice,
    sellBatchId,
    sellSelectionSummary?.hasPkgData,
    sellableOnTripRows,
    batchByIdForSell,
  ]);

  const { sellerCardTransferRubPreview, sellerCardTransferCashPreviewRub } = useMemo(() => {
    if (!isSellerUx || paymentKind !== "card_transfer") {
      return { sellerCardTransferRubPreview: null as string | null, sellerCardTransferCashPreviewRub: null as string | null };
    }
    const raw = cardTransferKopecks.trim();
    if (!raw) {
      return { sellerCardTransferRubPreview: null, sellerCardTransferCashPreviewRub: null };
    }
    const rub = nonnegativeDecimalStringToNumber(raw, 2);
    if (!Number.isFinite(rub) || rub < 0) {
      return { sellerCardTransferRubPreview: null, sellerCardTransferCashPreviewRub: null };
    }
    const cardK = Math.round(rub * 100);
    const cardLabel = kopecksToRubLabel(String(cardK));
    const totalK = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, { kgMaxFrac: 6, priceMaxFrac: 4 });
    if (!Number.isFinite(totalK) || totalK < 0 || cardK > totalK) {
      return { sellerCardTransferRubPreview: cardLabel, sellerCardTransferCashPreviewRub: null };
    }
    const cashK = totalK - cardK;
    return {
      sellerCardTransferRubPreview: cardLabel,
      sellerCardTransferCashPreviewRub: kopecksToRubLabel(String(cashK)),
    };
  }, [isSellerUx, paymentKind, cardTransferKopecks, sellKg, sellPrice]);

  /** Превью суммы наличными и остатка в долг при смешанной оплате (кабинет продавца, рубли). */
  const { sellerCashMixedRubPreview, sellerCashMixedDebtPreviewRub } = useMemo(() => {
    if (!isSellerUx || paymentKind !== "mixed") {
      return { sellerCashMixedRubPreview: null as string | null, sellerCashMixedDebtPreviewRub: null as string | null };
    }
    const raw = cashMixed.trim();
    if (!raw) {
      return { sellerCashMixedRubPreview: null, sellerCashMixedDebtPreviewRub: null };
    }
    const rub = nonnegativeDecimalStringToNumber(raw, 2);
    if (!Number.isFinite(rub) || rub < 0) {
      return { sellerCashMixedRubPreview: null, sellerCashMixedDebtPreviewRub: null };
    }
    const cashK = Math.round(rub * 100);
    const cashLabel = kopecksToRubLabel(String(cashK));
    const totalK = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, { kgMaxFrac: 6, priceMaxFrac: 4 });
    if (!Number.isFinite(totalK) || totalK < 0 || cashK >= totalK) {
      return { sellerCashMixedRubPreview: cashLabel, sellerCashMixedDebtPreviewRub: null };
    }
    const debtK = totalK - cashK;
    return {
      sellerCashMixedRubPreview: cashLabel,
      sellerCashMixedDebtPreviewRub: kopecksToRubLabel(String(debtK)),
    };
  }, [isSellerUx, paymentKind, cashMixed, sellKg, sellPrice]);

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
      const requirePackageCount = Boolean(sellSelectionSummary?.hasPkgData);
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
        sellerMoneyInRubles: isSellerUx,
        packageCountRaw: sellPackages,
        requirePackageCount,
      });
      const chunks = isSellerUx
        ? buildSellerSellChunks({
            sellBatchId: batchId,
            sellableRows: sellableOnTripRows,
            batchById: batchByIdForSell,
            kg: body.kg,
            pricePerKg: body.pricePerKg,
            packageCount: body.packageCount,
            paymentKind: body.paymentKind ?? "cash",
            cashKopecksMixed:
              body.cashKopecksMixed != null ? String(body.cashKopecksMixed) : undefined,
            cardTransferKopecks:
              body.cardTransferKopecks != null ? String(body.cardTransferKopecks) : undefined,
          })
        : [{ batchId, kg: body.kg, ...(body.packageCount !== undefined ? { packageCount: body.packageCount } : {}) }];
      if (chunks.length === 0) {
        throw new Error("Укажите кг не больше остатка по выбранному калибру");
      }
      let saved = 0;
      try {
        for (let i = 0; i < chunks.length; i++) {
          const part = chunks[i]!;
          const { cashKopecksMixed: _cm, cardTransferKopecks: _ct, ...bodyBase } = body;
          const chunkBody = {
            ...bodyBase,
            kg: part.kg,
            saleId: i === 0 ? body.saleId : randomUuid(),
            ...(part.packageCount !== undefined ? { packageCount: part.packageCount } : {}),
            ...(part.cashKopecksMixed !== undefined ? { cashKopecksMixed: part.cashKopecksMixed } : {}),
            ...(part.cardTransferKopecks !== undefined
              ? { cardTransferKopecks: part.cardTransferKopecks }
              : {}),
          };
          const url = `/api/batches/${encodeURIComponent(part.batchId)}/sell-from-trip`;
          await apiPostJson(url, chunkBody);
          saved += 1;
        }
      } catch (e) {
        if (saved > 0) {
          throw new Error(
            `Сохранено ${saved} из ${chunks.length} частей продажи. Обновите страницу и проверьте остаток по калибру.`,
          );
        }
        if (isLikelyNetworkOrOfflineFailure(e)) {
          throw new Error("Нет связи с сервером. Продажа не сохранена — подключите сеть и повторите.");
        }
        throw e;
      }
      const totalKopecks = purchaseLineAmountKopecksFromDecimalStrings(sellKg, sellPrice, {
        kgMaxFrac: 6,
        priceMaxFrac: 4,
      });
      const sumRub =
        Number.isFinite(totalKopecks) && totalKopecks >= 0
          ? kopecksToRubLabel(String(Math.round(totalKopecks)))
          : "—";
      const summaryLine = sellSelectionSummary?.line?.trim();
      const productLine = summaryLine && summaryLine !== "—" ? summaryLine : "Товар";
      const pkgTrim = sellPackages.trim();
      return {
        kg: sellKg.trim(),
        packages: pkgTrim || null,
        sumRub,
        productLine,
      };
    },
    onMutate: () => {
      if (isSellerUx) {
        setSellerSaleFlash(null);
      }
    },
    onSuccess: (data) => {
      invalidateDomain();
      if (isSellerUx) {
        clearSellerSaleInputs();
        setSellerSaleFlash({ ...data });
        requestAnimationFrame(() => {
          document.getElementById(sellerFlashDomId)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
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
          <div className="birzha-seller-sale-flash__title">Продажа записана</div>
          <p className="birzha-seller-sale-flash__lead">
            <strong>{sellerSaleFlash.productLine}</strong>
            <span className="birzha-seller-sale-flash__sep"> · </span>
            <span>{sellerSaleFlash.kg} кг</span>
            {sellerSaleFlash.packages ? (
              <>
                <span className="birzha-seller-sale-flash__sep"> · </span>
                <span>{sellerSaleFlash.packages} ящ</span>
              </>
            ) : null}
            <span className="birzha-seller-sale-flash__sep"> · </span>
            <span>
              сумма <strong>{sellerSaleFlash.sumRub} ₽</strong>
            </span>
          </p>
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
                setSellCounterpartyId("");
                setSellClientLabel("");
                setNewCounterpartyName("");
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
          {saleChannel === "retail" ? null : wholesalersCatalog ? (
            <div style={{ marginTop: "0.85rem" }} role="region" aria-labelledby={`${idPrefix}-wholesale-h`}>
              <span id={`${idPrefix}-wholesale-h`} className="birzha-form-label birzha-form-label--block" style={{ marginBottom: "0.35rem" }}>
                Оптовик *
              </span>
              <input
                value={wholesalerSearch}
                onChange={(e) => setWholesalerSearch(e.target.value)}
                className={sellerFieldClass}
                style={{ ...sellerFieldMb, maxWidth: "100%" }}
                placeholder={
                  isSellerUx
                    ? activeWholesalers.length > WHOLESALER_SELLER_MAX_ROWS
                      ? "Сузить список по названию…"
                      : "Название оптовика…"
                    : "Найти по названию…"
                }
                autoComplete="off"
                aria-label="Поиск оптовика"
              />
              {isSellerUx && wholesalerSearch.trim() !== wholesalerSearchDebounced.trim() ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.25rem 0 0" }} role="status">
                  Подождите, ищем…
                </p>
              ) : null}
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
                  {activeWholesalers.length === 0 ? (
                    <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
                      Активных оптовиков нет — их добавляет администратор в разделе «Инвентарь».
                    </li>
                  ) : wholesaleRowsFiltered.length === 0 ? (
                    <li className="birzha-text-muted" style={{ padding: "0.5rem 0.65rem", fontSize: "0.88rem" }}>
                      Нет совпадений по поиску — измените запрос.
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
              {isSellerUx && wholesalerPickerFiltered.truncated ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0.35rem 0 0" }}>
                  Показаны первые {WHOLESALER_SELLER_MAX_ROWS} из {wholesalerPickerFiltered.totalMatched} — уточните
                  поиск, если нужного нет в списке.
                </p>
              ) : null}
              {selectedWholesalerLabel ? (
                <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.45rem 0 0" }}>
                  <strong>{selectedWholesalerLabel}</strong>
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
              <BirzhaEmptyState
                compact
                title={sellerHasAssignedClosedOnly ? "Активных рейсов нет" : "Нет закреплённых рейсов"}
                description={
                  sellerHasAssignedClosedOnly
                    ? "Активных рейсов нет. Итоги по проданным и закрытым — в разделе «Архив» в меню."
                    : undefined
                }
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
                setSellPackages("");
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
                <option value={sellTripIdTrim}>Рейс из ссылки</option>
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
            setSellPackages("");
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
          {isSellerUx
            ? "Ошибка загрузки остатков по рейсу. Повторите позже или обратитесь к администратору."
            : "Ошибка отчёта по рейсу. Выберите другой рейс или обновите страницу."}
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
            label={isSellerUx ? "Загрузка калибров…" : "Загрузка накладных по строкам рейса…"}
          />
        </p>
      )}
      {showBatchListFilter && (
        <>
          <label htmlFor={`${idPrefix}-party-filter`} className="birzha-form-label">
            {isSellerUx ? "Поиск по калибру" : "Фильтр списка (накладная, калибр)"}
          </label>
          <input
            id={`${idPrefix}-party-filter`}
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : { ...fieldStyle, marginBottom: "0.45rem", maxWidth: "100%" }}
            placeholder={isSellerUx ? "Калибр…" : "Накладная или калибр…"}
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
            Калибр на рейсе *
          </legend>
          {sellBatchSelectDisabled ? (
            <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
              {sellerCaliberGridStatusMessage}
            </p>
          ) : (
            <>
              {sellerTripSellTilesFiltered.length === 0 ? (
                <p className="birzha-text-muted birzha-ui-sm" style={{ margin: "0 0 0.5rem" }} role="status">
                  Нет строк.
                </p>
              ) : (
                <div
                  className="birzha-seller-caliber-grid"
                  role="listbox"
                  aria-label="Калибры на рейсе (остаток в машине)"
                  id={`${idPrefix}-sel-batch`}
                >
                  {sellerTripSellTilesFiltered.map((t) => {
                    const selected = sellCaliberKey === t.key;
                    const kgLine = gramsBigIntToKgDecimalString(t.totalNetG);
                    return (
                      <button
                        key={t.key}
                        type="button"
                        className={
                          selected
                            ? "birzha-seller-caliber-tile birzha-seller-caliber-tile--selected"
                            : "birzha-seller-caliber-tile"
                        }
                        role="option"
                        aria-selected={selected}
                        onClick={() => applySellerCaliberTile(t)}
                      >
                        <span className="birzha-seller-caliber-tile__line">{t.headline}</span>
                        <span className="birzha-seller-caliber-tile__kg">{kgLine} кг</span>
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
                setSellPackages("");
                return;
              }
              const row = sellableOnTripRows.find((r) => r.batchId === id);
              if (row) {
                setSellKg(gramsBigIntToKgDecimalString(row.netTransitG));
                const est = estimateNetTransitPackageCountForSell(
                  row,
                  batchByIdForSell.get(row.batchId),
                );
                setSellPackages(est > 0n ? String(est) : "");
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
                    ? "— список недоступен —"
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
          <strong>{isSellerUx ? "В машине" : "В пути"}: {sellSelectionSummary.kg} кг</strong>
          {sellSelectionSummary.hasPkgData && sellSelectionSummary.estPkg > 0n && (
            <>
              {" "}
              · <strong>≈ {String(sellSelectionSummary.estPkg)} ящ</strong>
            </>
          )}
          {sellSelectionSummary.subUnitPackages && <> · &lt; 1 ящ</>}
        </p>
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
      {sellSelectionSummary?.hasPkgData ? (
        <>
          <label
            htmlFor={`${idPrefix}-in-pkg`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            {isSellerUx ? "Сколько ящиков в этой сделке *" : "Сколько ящиков в этой продаже *"}
          </label>
          <input
            id={`${idPrefix}-in-pkg`}
            value={sellPackages}
            onChange={(e) => setSellPackages(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? sellerFieldMb : fieldStyle}
            inputMode="numeric"
            autoComplete="off"
            placeholder={
              sellSelectionSummary.estPkg > 0n
                ? `не больше ${String(sellSelectionSummary.estPkg)}`
                : undefined
            }
          />
        </>
      ) : null}
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
          {selectedWholesalerLabel ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0.4rem 0 0" }}>
              <strong>{selectedWholesalerLabel}</strong>
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
        <option value="mixed">
          {isSellerUx ? "Наличные + долг (сумма наличными — в рублях ниже)" : "Смешанно: наличные + долг (укажите нал ниже)"}
        </option>
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
            {isSellerUx ? "Сумма онлайн-перевода на карту, руб *" : "Сумма онлайн-перевода на карту (копейки, только цифры) *"}
          </label>
          <input
            id={`${idPrefix}-in-card-kop`}
            value={cardTransferKopecks}
            onChange={(e) => setCardTransferKopecks(e.target.value)}
            className={sellerFieldClass}
            style={isSellerUx ? { ...fieldStyle, ...sellerFieldMb } : fieldStyle}
            placeholder={isSellerUx ? "например 4950 или 4950,50 — остаток выручки наличными" : "например 75000 (= 750 ₽ переводом); остальное — наличными"}
            inputMode="decimal"
            autoComplete="off"
          />
          {isSellerUx && sellerCardTransferRubPreview ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "-0.35rem 0 0.35rem", lineHeight: 1.45 }}>
              В учёт уйдёт переводом: <strong>{sellerCardTransferRubPreview} ₽</strong>
              {sellerCardTransferCashPreviewRub ? (
                <>
                  {" "}
                  · наличными: <strong>{sellerCardTransferCashPreviewRub} ₽</strong>
                </>
              ) : null}
            </p>
          ) : null}
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
            {isSellerUx ? "Сколько наличными из сделки, руб *" : "Сколько наличными из сделки (копейки, только цифры) *"}
          </label>
          <input
            id={`${idPrefix}-in-mixed`}
            value={cashMixed}
            onChange={(e) => setCashMixed(e.target.value)}
            className={isSellerUx ? sellerFieldClass : undefined}
            style={isSellerUx ? { ...fieldStyle, ...sellerFieldMb } : fieldStyle}
            placeholder={
              isSellerUx
                ? "например 2500 или 2500,50 — остаток выручки в долг"
                : "например 50000 (= 500 руб)"
            }
            inputMode={isSellerUx ? "decimal" : "numeric"}
            autoComplete="off"
          />
          {isSellerUx && sellerCashMixedRubPreview ? (
            <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "-0.35rem 0 0.35rem", lineHeight: 1.45 }}>
              В учёт уйдёт наличными: <strong>{sellerCashMixedRubPreview} ₽</strong>
              {sellerCashMixedDebtPreviewRub ? (
                <>
                  {" "}
                  · в долг: <strong>{sellerCashMixedDebtPreviewRub} ₽</strong>
                </>
              ) : null}
            </p>
          ) : null}
        </>
      )}
      {isSellerUx && sellerSellBlockReason ? (
        <p role="status" style={{ ...warnText, marginTop: "0.5rem", marginBottom: 0 }}>
          {sellerSellBlockReason}
        </p>
      ) : null}
      <button
        type="button"
        style={{
          ...btnStyle,
          ...(variant === "seller"
            ? { fontSize: "1.1rem", padding: "0.75rem 1.15rem", fontWeight: 700, marginTop: "0.65rem" }
            : { marginTop: "0.5rem" }),
        }}
        disabled={sell.isPending || Boolean(isSellerUx && sellerSellBlockReason)}
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
      {isSellerUx && sellTripIdTrim ? (
        <SellerTripSaleCorrections
          tripId={sellTripIdTrim}
          tripOpen={selectedTripOpen}
          sellableRows={sellableOnTripRows}
        />
      ) : null}
    </BirzhaDisclosure>
  );
}
