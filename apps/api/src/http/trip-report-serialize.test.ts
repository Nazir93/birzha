import { describe, expect, it } from "vitest";

import type { TripSaleAggregate } from "../application/ports/trip-sale-repository.port.js";

import { saleLedgerAggregateToJson } from "./trip-report-serialize.js";

function minimalSaleAggregate(overrides: Partial<TripSaleAggregate> = {}): TripSaleAggregate {
  return {
    totalGrams: 0n,
    totalRevenueKopecks: 0n,
    totalCashKopecks: 0n,
    totalDebtKopecks: 0n,
    totalCardTransferKopecks: 0n,
    retailGrams: 0n,
    wholesaleGrams: 0n,
    retailRevenueKopecks: 0n,
    wholesaleRevenueKopecks: 0n,
    retailCashKopecks: 0n,
    retailDebtKopecks: 0n,
    retailCardTransferKopecks: 0n,
    wholesaleCashKopecks: 0n,
    wholesaleDebtKopecks: 0n,
    wholesaleCardTransferKopecks: 0n,
    byBatch: [],
    byClient: [],
    ...overrides,
  };
}

describe("saleLedgerAggregateToJson", () => {
  it("отдаёт оплату по рознице и опту для отчёта продавца", () => {
    const json = saleLedgerAggregateToJson(
      minimalSaleAggregate({
        retailGrams: 100n,
        wholesaleGrams: 50n,
        retailCashKopecks: 800n,
        retailDebtKopecks: 200n,
        retailCardTransferKopecks: 0n,
        wholesaleCashKopecks: 0n,
        wholesaleDebtKopecks: 400n,
        wholesaleCardTransferKopecks: 0n,
      }),
    );
    expect(json.retailCashKopecks).toBe("800");
    expect(json.retailDebtKopecks).toBe("200");
    expect(json.wholesaleDebtKopecks).toBe("400");
    expect(json.wholesaleCashKopecks).toBe("0");
  });
});
