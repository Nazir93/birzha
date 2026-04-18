import { describe, expect, it } from "vitest";

import { buildTripSaleAggregateFromRows } from "./trip-sale-aggregate.js";

describe("buildTripSaleAggregateFromRows", () => {
  it("агрегирует по партиям и по клиентам", () => {
    const agg = buildTripSaleAggregateFromRows([
      {
        batchId: "b1",
        grams: 100n,
        revenueKopecks: 1000n,
        cashKopecks: 600n,
        debtKopecks: 400n,
        clientLabel: "А",
      },
      {
        batchId: "b1",
        grams: 50n,
        revenueKopecks: 500n,
        cashKopecks: 500n,
        debtKopecks: 0n,
        clientLabel: "Б",
      },
      {
        batchId: "b2",
        grams: 30n,
        revenueKopecks: 300n,
        cashKopecks: 0n,
        debtKopecks: 300n,
        clientLabel: null,
      },
    ]);
    expect(agg.totalGrams).toBe(180n);
    expect(agg.totalRevenueKopecks).toBe(1800n);
    expect(agg.byBatch).toHaveLength(2);
    const b1 = agg.byBatch.find((x) => x.batchId === "b1")!;
    expect(b1.grams).toBe(150n);
    expect(agg.byClient.map((c) => c.clientLabel)).toEqual(["А", "Б", ""]);
    const a = agg.byClient.find((c) => c.clientLabel === "А")!;
    expect(a.grams).toBe(100n);
    const empty = agg.byClient.find((c) => c.clientLabel === "")!;
    expect(empty.grams).toBe(30n);
  });
});
