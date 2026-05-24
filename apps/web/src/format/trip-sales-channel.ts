import type { SalesBlock } from "../api/types.js";

export type SaleChannelFilter = "all" | "retail" | "wholesale";

export type SalesBatchLine = SalesBlock["byBatch"][number];
export type SalesClientLine = SalesBlock["byClient"][number];

export function salesBatchLinesForChannel(sales: SalesBlock, channel: SaleChannelFilter): SalesBatchLine[] {
  if (channel === "retail") {
    return sales.retailByBatch ?? [];
  }
  if (channel === "wholesale") {
    return sales.wholesaleByBatch ?? [];
  }
  return sales.byBatch;
}

export function salesClientLinesForChannel(sales: SalesBlock, channel: SaleChannelFilter): SalesClientLine[] {
  if (channel === "retail") {
    return sales.retailByClient ?? [];
  }
  if (channel === "wholesale") {
    return sales.wholesaleByClient ?? [];
  }
  return sales.byClient;
}

export type SalesChannelTotals = {
  grams: string;
  revenueKopecks: string;
  cashKopecks: string;
  debtKopecks: string;
  cardTransferKopecks: string;
};

export function salesChannelTotals(sales: SalesBlock, channel: SaleChannelFilter): SalesChannelTotals {
  if (channel === "retail") {
    return {
      grams: sales.retailGrams,
      revenueKopecks: sales.retailRevenueKopecks,
      cashKopecks: sales.retailCashKopecks,
      debtKopecks: sales.retailDebtKopecks,
      cardTransferKopecks: sales.retailCardTransferKopecks,
    };
  }
  if (channel === "wholesale") {
    return {
      grams: sales.wholesaleGrams,
      revenueKopecks: sales.wholesaleRevenueKopecks,
      cashKopecks: sales.wholesaleCashKopecks,
      debtKopecks: sales.wholesaleDebtKopecks,
      cardTransferKopecks: sales.wholesaleCardTransferKopecks,
    };
  }
  return {
    grams: sales.totalGrams,
    revenueKopecks: sales.totalRevenueKopecks,
    cashKopecks: sales.totalCashKopecks,
    debtKopecks: sales.totalDebtKopecks,
    cardTransferKopecks: sales.totalCardTransferKopecks,
  };
}

export const SALE_CHANNEL_LABELS: Record<SaleChannelFilter, string> = {
  all: "Всего",
  retail: "Розница",
  wholesale: "Опт",
};

/** Подпись в колонке «Кому» / «Клиент» в отчётах по продажам. */
export const RETAIL_SALE_CLIENT_DISPLAY_LABEL = "Розница";

/**
 * Пустая метка у розницы (полевой продавец без имени клиента) → «Розница».
 * Опт без имени (редко) остаётся «—».
 */
export function formatTripSaleClientDisplayLabel(
  clientLabel: string | null | undefined,
  channel: SaleChannelFilter,
): string {
  const trimmed = (clientLabel ?? "").trim();
  if (trimmed) {
    return trimmed;
  }
  if (channel === "wholesale") {
    return "Опт";
  }
  return RETAIL_SALE_CLIENT_DISPLAY_LABEL;
}

/** Таблица «кому» при фильтре «Розница» дублирует сводку по калибрам — не показываем. */
export function shouldShowSalesClientTable(channel: SaleChannelFilter): boolean {
  return channel !== "retail";
}
