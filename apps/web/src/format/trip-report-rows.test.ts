import { describe, expect, it } from "vitest";

import type { ShipmentReportResponse } from "../api/types.js";

import {
  aggregateTripBatchRows,
  buildTripBatchRows,
  reconcileBatchTotalsWithReport,
} from "./trip-report-rows.js";

const baseReport = (): ShipmentReportResponse => ({
  trip: { id: "t1", tripNumber: "T-1", status: "open" },
  shipment: {
    totalGrams: "5000",
    byBatch: [
      { batchId: "b1", grams: "3000" },
      { batchId: "b2", grams: "2000" },
    ],
  },
  sales: {
    totalGrams: "1000",
    totalRevenueKopecks: "50000",
    totalCashKopecks: "30000",
    totalDebtKopecks: "20000",
    byBatch: [
      { batchId: "b1", grams: "1000", revenueKopecks: "50000", cashKopecks: "30000", debtKopecks: "20000" },
    ],
    byClient: [
      { clientLabel: "", grams: "1000", revenueKopecks: "50000", cashKopecks: "30000", debtKopecks: "20000" },
    ],
  },
  shortage: {
    totalGrams: "500",
    byBatch: [{ batchId: "b1", grams: "500" }],
  },
  financials: {
    revenueKopecks: "50000",
    costOfSoldKopecks: "10000",
    costOfShortageKopecks: "5000",
    grossProfitKopecks: "35000",
  },
});

describe("buildTripBatchRows", () => {
  it("собирает строки и считает остаток в пути по партии", () => {
    const rows = buildTripBatchRows(baseReport());
    expect(rows).toHaveLength(2);
    const b1 = rows.find((r) => r.batchId === "b1")!;
    expect(b1.shippedG).toBe(3000n);
    expect(b1.soldG).toBe(1000n);
    expect(b1.shortageG).toBe(500n);
    expect(b1.netTransitG).toBe(1500n);
    expect(b1.revenueK).toBe(50000n);

    const b2 = rows.find((r) => r.batchId === "b2")!;
    expect(b2.shippedG).toBe(2000n);
    expect(b2.soldG).toBe(0n);
    expect(b2.shortageG).toBe(0n);
    expect(b2.netTransitG).toBe(2000n);
    expect(b2.revenueK).toBe(0n);
  });

  it("пустые byBatch дают пустой массив", () => {
    const r = baseReport();
    r.shipment.byBatch = [];
    r.sales.byBatch = [];
    r.shortage.byBatch = [];
    expect(buildTripBatchRows(r)).toEqual([]);
  });

  it("aggregateTripBatchRows суммирует колонки", () => {
    const rows = buildTripBatchRows(baseReport());
    const agg = aggregateTripBatchRows(rows);
    expect(agg.shippedG).toBe(5000n);
    expect(agg.soldG).toBe(1000n);
    expect(agg.shortageG).toBe(500n);
    expect(agg.netTransitG).toBe(3500n);
  });

  it("reconcileBatchTotalsWithReport совпадает с корректным отчётом", () => {
    const r = baseReport();
    const rows = buildTripBatchRows(r);
    const agg = aggregateTripBatchRows(rows);
    const rec = reconcileBatchTotalsWithReport(r, agg);
    expect(rec.shipmentGramsOk).toBe(true);
    expect(rec.salesGramsOk).toBe(true);
    expect(rec.shortageGramsOk).toBe(true);
    expect(rec.revenueKopecksOk).toBe(true);
    expect(rec.cashDebtOk).toBe(true);
    expect(rec.clientTotalsOk).toBe(true);
  });

  it("reconcileBatchTotalsWithReport ловит расхождение total с партиями", () => {
    const r = baseReport();
    r.shipment.totalGrams = "1";
    const rows = buildTripBatchRows(r);
    const agg = aggregateTripBatchRows(rows);
    expect(reconcileBatchTotalsWithReport(r, agg).shipmentGramsOk).toBe(false);
  });

  it("reconcileBatchTotalsWithReport ловит расхождение итогов с разбивкой по клиентам", () => {
    const r = baseReport();
    r.sales.byClient = [{ clientLabel: "А", grams: "1", revenueKopecks: "1", cashKopecks: "1", debtKopecks: "0" }];
    const rows = buildTripBatchRows(r);
    const agg = aggregateTripBatchRows(rows);
    expect(reconcileBatchTotalsWithReport(r, agg).clientTotalsOk).toBe(false);
  });
});
