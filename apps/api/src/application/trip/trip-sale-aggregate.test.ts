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
    expect(agg.totalCardTransferKopecks).toBe(0n);
    expect(agg.retailGrams).toBe(180n);
    expect(agg.wholesaleGrams).toBe(0n);
    expect(agg.retailRevenueKopecks).toBe(1800n);
    expect(agg.wholesaleRevenueKopecks).toBe(0n);
    expect(agg.byBatch).toHaveLength(2);
    const b1 = agg.byBatch.find((x) => x.batchId === "b1")!;
    expect(b1.grams).toBe(150n);
    expect(agg.byClient.map((c) => c.clientLabel)).toEqual(["А", "Б", ""]);
    const a = agg.byClient.find((c) => c.clientLabel === "А")!;
    expect(a.grams).toBe(100n);
    const empty = agg.byClient.find((c) => c.clientLabel === "")!;
    expect(empty.grams).toBe(30n);
  });

  it("разделяет розницу и опт по каналу продажи", () => {
    const agg = buildTripSaleAggregateFromRows([
      {
        batchId: "b1",
        grams: 100n,
        revenueKopecks: 1000n,
        cashKopecks: 1000n,
        debtKopecks: 0n,
        clientLabel: "Розн",
        saleChannel: "retail",
      },
      {
        batchId: "b1",
        grams: 50n,
        revenueKopecks: 400n,
        cashKopecks: 400n,
        debtKopecks: 0n,
        clientLabel: "Опт",
        saleChannel: "wholesale",
      },
    ]);
    expect(agg.retailGrams).toBe(100n);
    expect(agg.wholesaleGrams).toBe(50n);
    expect(agg.retailRevenueKopecks).toBe(1000n);
    expect(agg.wholesaleRevenueKopecks).toBe(400n);
    expect(agg.retailCashKopecks).toBe(1000n);
    expect(agg.wholesaleCashKopecks).toBe(400n);
    expect(agg.retailDebtKopecks).toBe(0n);
    expect(agg.wholesaleDebtKopecks).toBe(0n);
    expect(agg.totalGrams).toBe(150n);
  });

  it("суммирует карту и долг по каналу отдельно", () => {
    const agg = buildTripSaleAggregateFromRows([
      {
        batchId: "b1",
        grams: 60n,
        revenueKopecks: 600n,
        cashKopecks: 100n,
        debtKopecks: 200n,
        cardTransferKopecks: 300n,
        clientLabel: "",
        saleChannel: "retail",
      },
      {
        batchId: "b2",
        grams: 40n,
        revenueKopecks: 400n,
        cashKopecks: 0n,
        debtKopecks: 400n,
        cardTransferKopecks: 0n,
        clientLabel: "ООО Опт",
        saleChannel: "wholesale",
      },
    ]);
    expect(agg.retailCashKopecks).toBe(100n);
    expect(agg.retailDebtKopecks).toBe(200n);
    expect(agg.retailCardTransferKopecks).toBe(300n);
    expect(agg.wholesaleDebtKopecks).toBe(400n);
    expect(agg.totalCashKopecks).toBe(100n);
    expect(agg.totalDebtKopecks).toBe(600n);
    expect(agg.totalCardTransferKopecks).toBe(300n);
  });

  it("разделяет byBatch и byClient по каналу", () => {
    const agg = buildTripSaleAggregateFromRows([
      {
        batchId: "b1",
        grams: 100n,
        revenueKopecks: 1000n,
        cashKopecks: 1000n,
        debtKopecks: 0n,
        clientLabel: "Розн",
        saleChannel: "retail",
      },
      {
        batchId: "b2",
        grams: 50n,
        revenueKopecks: 400n,
        cashKopecks: 400n,
        debtKopecks: 0n,
        clientLabel: "Оптик",
        saleChannel: "wholesale",
      },
    ]);
    expect(agg.retailByBatch).toHaveLength(1);
    expect(agg.retailByBatch[0]!.batchId).toBe("b1");
    expect(agg.wholesaleByBatch[0]!.batchId).toBe("b2");
    expect(agg.retailByClient.find((c) => c.clientLabel === "Розн")!.grams).toBe(100n);
    expect(agg.wholesaleByClient.find((c) => c.clientLabel === "Оптик")!.grams).toBe(50n);
  });
});
