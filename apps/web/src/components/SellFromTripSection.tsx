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
  maxSellablePackagesForSellKg,
  sellerCaliberGroupKey,
} from "../format/seller-trip-caliber-groups.js";
import { buildSellerSellChunks, sellerSellPlanBlockReason } from "../format/seller-sell-chunk-plan.js";
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
import {
  batchesByIdsQueryOptions,
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
import { SellerWholesalerPicker } from "./SellerWholesalerPicker.js";
import { BirzhaAlert } from "../ui/BirzhaAlert.js";
import { FieldError } from "../ui/FieldError.js";
import { LoadingIndicator } from "../ui/LoadingIndicator.js";
import { ErrorAlert, WarningAlert } from "../ui/ErrorAlerts.js";
import { SellerSaleSuccessOverlay } from "./SellerSaleSuccessOverlay.js";
import { btnStyle, fieldStyle } from "../ui/styles.js";

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

/**
 * Форма продажи с рейса для кабинета продавца (/s): рейс → партия (калибр) → кг, цена, оплата.
 */
export function SellFromTripSection() {
  const { meta } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const idPrefix = "seller-sell";
  /** Якорь для прокрутки `?focus=sell` */
  const scrollTargetId = "seller-work-sell";
  const headingId = `${scrollTargetId}-h`;

  const invalidateDomain = () => {
    void queryClient.invalidateQueries({ queryKey: queryRoots.shipmentReport });
    void queryClient.invalidateQueries({ queryKey: queryRoots.tripSaleLines });
    void queryClient.invalidateQueries({ queryKey: queryRoots.batches });
    void queryClient.invalidateQueries({ queryKey: queryRoots.trips });
  };

  const wholesalersCatalog = meta?.wholesalersCatalogApi === "enabled";
  const wholesalersQ = useQuery({
    ...wholesalersFullListQueryOptions(),
    enabled: wholesalersCatalog,
  });

  const [sellBatchId, setSellBatchId] = useState("");
  const [sellTripId, setSellTripId] = useState("");
  const [sellKg, setSellKg] = useState("");
  const [sellPackages, setSellPackages] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [saleChannel, setSaleChannel] = useState<"retail" | "wholesale">("retail");
  const [wholesaleBuyerId, setWholesaleBuyerId] = useState("");
  const [paymentKind, setPaymentKind] = useState<"cash" | "debt" | "mixed" | "card_transfer">("cash");
  const sellerFieldClass = "birzha-seller-form-control";
  const sellerFieldMb = { marginBottom: "0.45rem" as const, maxWidth: "100%" as const };
  const [cashMixed, setCashMixed] = useState("");
  const [cardTransferKopecks, setCardTransferKopecks] = useState("");
  /** Ключ выбранной плитки калибра (группа партий, как в погрузочной накладной). */
  const [sellCaliberKey, setSellCaliberKey] = useState<string | null>(null);

  const [sellerSaleFlash, setSellerSaleFlash] = useState<{
    kg: string;
    packages: string | null;
    sumRub: string;
    productLine: string;
  } | null>(null);

  const sellerTripsListQ = useQuery(tripsFullListQueryOptions());

  useEffect(() => {
    setSellerSaleFlash(null);
  }, [sellTripId, sellBatchId]);

  useEffect(() => {
    const p = searchParams.get("trip")?.trim() ?? "";
    if (!p) {
      return;
    }
    const raw = sellerTripsListQ.data?.trips ?? [];
    const tripRow = raw.find((x) => x.id === p);
    if (tripRow && tripRow.status === TRIP_STATUS_CLOSED) {
      return;
    }
    setSellTripId(p);
    setSellBatchId("");
    setSellKg("");
    setSellPackages("");
  }, [searchParams, sellerTripsListQ.data?.trips]);

  /** Рейс закрыт в админке — сбрасываем выбор и URL, чтобы кабинет «очистился». */
  useEffect(() => {
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
  }, [sellTripId, sellerTripsListQ.data?.trips, searchParams, navigate, location.pathname]);

  /** Один открытый закреплённый рейс — сразу подставляем (меньше шагов для продавца). */
  useEffect(() => {
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
  }, [searchParams, sellTripId, sellerTripsListQ.data?.trips]);

  useEffect(() => {
    setSellCaliberKey(null);
  }, [sellTripId]);

  useEffect(() => {
    if (saleChannel === "retail") {
      setWholesaleBuyerId("");
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
    () => sortTripsByTripNumberAsc(sellerTripsListQ.data?.trips ?? []).filter(isTripOpenForSellerWorkspace),
    [sellerTripsListQ.data?.trips],
  );

  const sellerHasAssignedClosedOnly = useMemo(() => {
    const all = sellerTripsListQ.data?.trips ?? [];
    if (all.length === 0) {
      return false;
    }
    return all.every((t) => !isTripOpenForSellerWorkspace(t));
  }, [sellerTripsListQ.data?.trips]);

  const sellTripIdTrim = sellTripId.trim();
  const selectedTripOpen = useMemo(() => {
    if (!sellTripIdTrim) {
      return true;
    }
    const t = (sellerTripsListQ.data?.trips ?? []).find((x) => x.id === sellTripIdTrim);
    return t ? isTripOpenForSellerWorkspace(t) : true;
  }, [sellTripIdTrim, sellerTripsListQ.data?.trips]);
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
    setCashMixed("");
    setCardTransferKopecks("");
    setWholesaleBuyerId("");
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

  const sellPkgMaxHint = useMemo(() => {
    if (!sellSelectionSummary?.hasPkgData || !sellBatchId.trim()) {
      return null;
    }
    const kgNum = Number(sellKg.replace(",", "."));
    const max =
      Number.isFinite(kgNum) && kgNum > 0
        ? maxSellablePackagesForSellKg(sellBatchId, sellableOnTripRows, batchByIdForSell, kgNum)
        : sellSelectionSummary.estPkg;
    return max > 0n ? String(max) : null;
  }, [
    sellSelectionSummary?.hasPkgData,
    sellSelectionSummary?.estPkg,
    sellBatchId,
    sellKg,
    sellableOnTripRows,
    batchByIdForSell,
  ]);

  /** Блок «Зафиксировать» у продавца: опт без выбора, сумма карты, лимит к выручке. */
  const sellerSellBlockReason = useMemo(() => {
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
        return "Укажите сумму наличными при смешанной оплате (рубли)";
      }
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
    }
    if (!sellPrice.trim()) {
      return "Укажите цену за кг";
    }
    if (sellBatchId.trim() && sellKg.trim() && sellPrice.trim()) {
      const planErr = sellerSellPlanBlockReason({
        sellBatchId,
        sellableRows: sellableOnTripRows,
        batchById: batchByIdForSell,
        kgRaw: sellKg,
        priceRaw: sellPrice,
        packageCountRaw: sellPackages,
        requirePackageCount: Boolean(sellSelectionSummary?.hasPkgData),
        paymentKind,
      });
      if (planErr) {
        return planErr;
      }
    }
    return null;
  }, [
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
    if (paymentKind !== "card_transfer") {
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
  }, [paymentKind, cardTransferKopecks, sellKg, sellPrice]);

  /** Превью суммы наличными и остатка в долг при смешанной оплате (рубли). */
  const { sellerCashMixedRubPreview, sellerCashMixedDebtPreviewRub } = useMemo(() => {
    if (paymentKind !== "mixed") {
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
  }, [paymentKind, cashMixed, sellKg, sellPrice]);

  const sell = useMutation({
    mutationFn: async () => {
      const requirePackageCount = Boolean(sellSelectionSummary?.hasPkgData);
      const { batchId, body } = parseSellFromTripForm({
        batchId: sellBatchId,
        tripId: sellTripId,
        kg: sellKg,
        saleId: randomUuid(),
        pricePerKg: sellPrice,
        saleChannel,
        paymentKind,
        cashMixed,
        cardTransferKopecks,
        wholesaleBuyerId: saleChannel === "wholesale" ? wholesaleBuyerId : undefined,
        sellerMoneyInRubles: true,
        packageCountRaw: sellPackages,
        requirePackageCount,
      });
      const chunks = buildSellerSellChunks({
        sellBatchId: batchId,
        sellableRows: sellableOnTripRows,
        batchById: batchByIdForSell,
        kg: body.kg,
        pricePerKg: body.pricePerKg,
        packageCount: body.packageCount,
        paymentKind: body.paymentKind ?? "cash",
        cashKopecksMixed: body.cashKopecksMixed != null ? String(body.cashKopecksMixed) : undefined,
        cardTransferKopecks:
          body.cardTransferKopecks != null ? String(body.cardTransferKopecks) : undefined,
      });
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
            saleId: body.saleId,
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
      setSellerSaleFlash(null);
    },
    onSuccess: (data) => {
      invalidateDomain();
      clearSellerSaleInputs();
      setSellerSaleFlash({ ...data });
    },
  });

  return (
    <BirzhaDisclosure
      id={scrollTargetId}
      className="birzha-seller-sell-panel"
      defaultOpen
      title={
        <h3 id={headingId} style={{ margin: 0, fontSize: "1.05rem" }}>
          Продажа с рейса
        </h3>
      }
    >
      {sellerSaleFlash ? (
        <SellerSaleSuccessOverlay data={sellerSaleFlash} onDismiss={() => setSellerSaleFlash(null)} />
      ) : null}
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
            }}
          >
            Розница
          </button>
          <button
            type="button"
            className={`birzha-seller-channel-pills__btn${saleChannel === "wholesale" ? " birzha-seller-channel-pills__btn--active" : ""}`}
            aria-pressed={saleChannel === "wholesale"}
            disabled={!wholesalersCatalog}
            title={wholesalersCatalog ? undefined : "Опт недоступен"}
            onClick={() => {
              if (!wholesalersCatalog) {
                return;
              }
              setSaleChannel("wholesale");
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
        {saleChannel === "wholesale" && wholesalersCatalog ? (
          <div style={{ marginTop: "0.85rem" }}>
            <SellerWholesalerPicker idPrefix={idPrefix} value={wholesaleBuyerId} onChange={setWholesaleBuyerId} />
          </div>
        ) : null}
      </section>

      <span className="birzha-form-label birzha-form-label--block birzha-form-label--mb-xs">Рейс *</span>
      <>
          {sellerTripsListQ.isPending && (
            <p style={{ margin: "0 0 0.5rem" }} role="status">
              <LoadingIndicator size="sm" label="Загрузка списка рейсов…" />
            </p>
          )}
          {sellerTripsListQ.isError ? (
            <ErrorAlert message="Рейсы не загрузились. Проверьте связь и обновите страницу." title="Список рейсов" />
          ) : null}
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
      {sellTripIdTrim && sellReportQuery.isError ? (
        <WarningAlert title="Данные рейса">
          Не удалось загрузить остатки по рейсу. Повторите позже или обратитесь к администратору.
        </WarningAlert>
      ) : null}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length === 0 && (
        <div style={{ marginTop: 0, marginBottom: "0.5rem" }}>
          <BirzhaEmptyState
            compact
            title={!tripHasPositiveShipment ? "Нет отгрузки в рейс" : "Нечего продавать"}
          />
        </div>
      )}
      {sellTripIdTrim && sellReportQuery.isSuccess && sellableOnTripRows.length > 0 && batchesForTripQuery.isFetching && (
        <p style={{ marginTop: 0, marginBottom: "0.45rem", fontSize: "0.86rem" }} role="status">
          <LoadingIndicator size="sm" label="Загрузка калибров…" />
        </p>
      )}
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
              {sellerTripSellTiles.length === 0 ? (
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
                  {sellerTripSellTiles.map((t) => {
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
      {sellSelectionSummary && (
        <p
          className="birzha-callout-info"
          style={{ fontSize: "0.86rem", marginTop: 0, marginBottom: "0.5rem" }}
          role="status"
          aria-live="polite"
        >
          <strong>{sellSelectionSummary.line}</strong>
          {". "}
          <strong>В машине: {sellSelectionSummary.kg} кг</strong>
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
        Сколько килограмм в этой сделке *
      </label>
      <input
        id={`${idPrefix}-in-kg`}
        value={sellKg}
        onChange={(e) => setSellKg(e.target.value)}
        className={sellerFieldClass}
        style={sellerFieldMb}
        inputMode="decimal"
        autoComplete="off"
      />
      {sellSelectionSummary?.hasPkgData ? (
        <>
          <label
            htmlFor={`${idPrefix}-in-pkg`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Сколько ящиков в этой сделке *
          </label>
          <input
            id={`${idPrefix}-in-pkg`}
            value={sellPackages}
            onChange={(e) => setSellPackages(e.target.value)}
            className={sellerFieldClass}
            style={sellerFieldMb}
            inputMode="numeric"
            autoComplete="off"
            placeholder={sellPkgMaxHint ? `не больше ${sellPkgMaxHint}` : undefined}
          />
        </>
      ) : null}
      <label htmlFor={`${idPrefix}-in-price`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        Цена за 1 кг, руб *
      </label>
      <input
        id={`${idPrefix}-in-price`}
        value={sellPrice}
        onChange={(e) => setSellPrice(e.target.value)}
        className={sellerFieldClass}
        style={sellerFieldMb}
        inputMode="decimal"
        autoComplete="off"
      />
      <p
        className="birzha-banner-distribution"
        style={{
          marginTop: "0.45rem",
          marginBottom: 0,
          fontSize: "1rem",
          fontWeight: 600,
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
      <label htmlFor={`${idPrefix}-sel-pay`} className="birzha-form-label birzha-form-label--block birzha-form-label--push-md">
        Как оплачивает клиент *
      </label>
      <select
        id={`${idPrefix}-sel-pay`}
        value={paymentKind}
        onChange={(e) =>
          setPaymentKind(e.target.value as "cash" | "debt" | "mixed" | "card_transfer")
        }
        className={sellerFieldClass}
        style={sellerFieldMb}
      >
        <option value="cash">Наличными целиком</option>
        <option value="debt">В долг целиком (без наличных)</option>
        <option value="mixed">Наличные + долг (сумма наличными — в рублях ниже)</option>
        <option value="card_transfer">Онлайн-перевод на карту + наличные (остаток наличными, не терминал)</option>
      </select>
      {paymentKind === "card_transfer" && (
        <>
          <label
            htmlFor={`${idPrefix}-in-card-kop`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Сумма онлайн-перевода на карту, руб *
          </label>
          <input
            id={`${idPrefix}-in-card-kop`}
            value={cardTransferKopecks}
            onChange={(e) => setCardTransferKopecks(e.target.value)}
            className={sellerFieldClass}
            style={{ ...fieldStyle, ...sellerFieldMb }}
            placeholder="например 4950 или 4950,50 — остаток выручки наличными"
            inputMode="decimal"
            autoComplete="off"
          />
          {sellerCardTransferRubPreview ? (
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
          <p className="birzha-text-muted birzha-text-muted--sm" style={{ margin: "0 0 0.5rem", lineHeight: 1.45 }}>
            Учёт: банковский перевод клиента на вашу карту (СБП / приложение банка). Не оплата картой через эквайринг.
          </p>
        </>
      )}
      {paymentKind === "mixed" && (
        <>
          <label
            htmlFor={`${idPrefix}-in-mixed`}
            className="birzha-form-label birzha-form-label--block birzha-form-label--push-md"
          >
            Сколько наличными из сделки, руб *
          </label>
          <input
            id={`${idPrefix}-in-mixed`}
            value={cashMixed}
            onChange={(e) => setCashMixed(e.target.value)}
            className={sellerFieldClass}
            style={{ ...fieldStyle, ...sellerFieldMb }}
            placeholder="например 2500 или 2500,50 — остаток выручки в долг"
            inputMode="decimal"
            autoComplete="off"
          />
          {sellerCashMixedRubPreview ? (
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
      {sellerSellBlockReason ? (
        <BirzhaAlert variant="warning" title="Перед сохранением" role="status">
          {sellerSellBlockReason}
        </BirzhaAlert>
      ) : null}
      <button
        type="button"
        style={{
          ...btnStyle,
          fontSize: "1.1rem",
          padding: "0.75rem 1.15rem",
          fontWeight: 700,
          marginTop: "0.65rem",
        }}
        disabled={sell.isPending || Boolean(sellerSellBlockReason)}
        aria-busy={sell.isPending || undefined}
        onClick={() => sell.mutate()}
      >
        {sell.isPending ? "Сохранение…" : "Зафиксировать продажу"}
      </button>
      <FieldError error={sell.error as Error | null} />
      {sellTripIdTrim ? (
        <SellerTripSaleCorrections
          tripId={sellTripIdTrim}
          tripOpen={selectedTripOpen}
          sellableRows={sellableOnTripRows}
        />
      ) : null}
    </BirzhaDisclosure>
  );
}
