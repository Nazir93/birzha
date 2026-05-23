import { describe, expect, it } from "vitest";

import type { SalesBlock } from "../api/types.js";

import {
  formatTripSaleClientDisplayLabel,
  salesBatchLinesForChannel,
  salesClientLinesForChannel,
  salesChannelTotals,
  shouldShowSalesClientTable,
} from "./trip-sales-channel.js";

function sales(overrides: Partial<SalesBlock> = {}): SalesBlock {
  return {
    totalGrams: "150",
    totalRevenueKopecks: "15000",
    totalCashKopecks: "15000",
    totalDebtKopecks: "0",
    totalCardTransferKopecks: "0",
    retailGrams: "100",
    wholesaleGrams: "50",
    retailRevenueKopecks: "10000",
    wholesaleRevenueKopecks: "5000",
    retailCashKopecks: "10000",
    retailDebtKopecks: "0",
    retailCardTransferKopecks: "0",
    wholesaleCashKopecks: "5000",
    wholesaleDebtKopecks: "0",
    wholesaleCardTransferKopecks: "0",
    byBatch: [
      {
        batchId: "b1",
        grams: "150",
        revenueKopecks: "15000",
        cashKopecks: "15000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ],
    byClient: [{ clientLabel: "Все", grams: "150", revenueKopecks: "15000", cashKopecks: "15000", debtKopecks: "0", cardTransferKopecks: "0" }],
    retailByBatch: [
      {
        batchId: "b1",
        grams: "100",
        revenueKopecks: "10000",
        cashKopecks: "10000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ],
    wholesaleByBatch: [
      {
        batchId: "b2",
        grams: "50",
        revenueKopecks: "5000",
        cashKopecks: "5000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ],
    retailByClient: [
      {
        clientLabel: "Розн",
        grams: "100",
        revenueKopecks: "10000",
        cashKopecks: "10000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ],
    wholesaleByClient: [
      {
        clientLabel: "Оптик",
        grams: "50",
        revenueKopecks: "5000",
        cashKopecks: "5000",
        debtKopecks: "0",
        cardTransferKopecks: "0",
      },
    ],
    ...overrides,
  };
}

describe("trip-sales-channel", () => {
  it("salesBatchLinesForChannel выбирает розницу и опт", () => {
    const s = sales();
    expect(salesBatchLinesForChannel(s, "retail")).toHaveLength(1);
    expect(salesBatchLinesForChannel(s, "retail")[0]!.batchId).toBe("b1");
    expect(salesBatchLinesForChannel(s, "wholesale")[0]!.batchId).toBe("b2");
    expect(salesBatchLinesForChannel(s, "all")).toHaveLength(1);
  });

  it("salesChannelTotals по каналу", () => {
    const s = sales();
    expect(salesChannelTotals(s, "retail").grams).toBe("100");
    expect(salesChannelTotals(s, "wholesale").revenueKopecks).toBe("5000");
  });

  it("salesClientLinesForChannel", () => {
    const s = sales();
    expect(salesClientLinesForChannel(s, "wholesale")[0]!.clientLabel).toBe("Оптик");
  });

  it("formatTripSaleClientDisplayLabel: пустая розница → Розница", () => {
    expect(formatTripSaleClientDisplayLabel("", "all")).toBe("Розница");
    expect(formatTripSaleClientDisplayLabel("  ", "retail")).toBe("Розница");
    expect(formatTripSaleClientDisplayLabel("Магазин", "all")).toBe("Магазин");
    expect(formatTripSaleClientDisplayLabel("", "wholesale")).toBe("—");
  });

  it("shouldShowSalesClientTable скрывает блок при фильтре розница", () => {
    expect(shouldShowSalesClientTable("all")).toBe(true);
    expect(shouldShowSalesClientTable("wholesale")).toBe(true);
    expect(shouldShowSalesClientTable("retail")).toBe(false);
  });
});
