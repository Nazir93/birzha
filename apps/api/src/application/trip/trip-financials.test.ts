import { describe, expect, it } from "vitest";

import type { TripSaleAggregate } from "../ports/trip-sale-repository.port.js";
import type { TripShortageAggregate } from "../ports/trip-shortage-repository.port.js";

import { computeTripFinancials } from "./trip-financials.js";

describe("computeTripFinancials", () => {
  it("валовая прибыль = выручка − себестоимость продаж − себестоимость недостачи", () => {
    const sales: TripSaleAggregate = {
      totalGrams: 1000n,
      totalRevenueKopecks: 50_000n,
      totalCashKopecks: 50_000n,
      totalDebtKopecks: 0n,
      byBatch: [
        {
          batchId: "b1",
          grams: 1000n,
          revenueKopecks: 50_000n,
          cashKopecks: 50_000n,
          debtKopecks: 0n,
        },
      ],
    };
    const shortage: TripShortageAggregate = {
      totalGrams: 200n,
      byBatch: [{ batchId: "b1", grams: 200n }],
    };
    const prices = new Map<string, number>([["b1", 10]]);
    const f = computeTripFinancials(sales, shortage, prices);
    expect(f.revenueKopecks).toBe(50_000n);
    expect(f.costOfSoldKopecks).toBe(1000n);
    expect(f.costOfShortageKopecks).toBe(200n);
    expect(f.grossProfitKopecks).toBe(48_800n);
  });
});
