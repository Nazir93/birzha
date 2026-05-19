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
