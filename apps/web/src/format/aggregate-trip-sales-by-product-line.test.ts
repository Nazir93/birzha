import { describe, expect, it } from "vitest";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";

import { aggregateTripSalesByProductLine } from "./aggregate-trip-sales-by-product-line.js";

function batch(id: string, group: string, grade: string): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 0,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "d1",
      documentNumber: "Н-1",
      warehouseId: "w1",
      productGroup: group,
      productGradeCode: grade,
    },
  };
}

function minimalReport(overrides: Partial<ShipmentReportResponse> = {}): ShipmentReportResponse {
  const base: ShipmentReportResponse = {
    trip: { id: "t1", tripNumber: "Р-1", status: "open" },
    shipment: { totalGrams: "0", totalPackageCount: "0", byBatch: [] },
    sales: {
      totalGrams: "0",
      totalRevenueKopecks: "0",
      totalCashKopecks: "0",
      totalDebtKopecks: "0",
      totalCardTransferKopecks: "0",
      retailGrams: "0",
      wholesaleGrams: "0",
      retailRevenueKopecks: "0",
      wholesaleRevenueKopecks: "0",
      retailCashKopecks: "0",
      retailDebtKopecks: "0",
      retailCardTransferKopecks: "0",
      wholesaleCashKopecks: "0",
      wholesaleDebtKopecks: "0",
      wholesaleCardTransferKopecks: "0",
      byBatch: [],
      byClient: [],
    },
    shortage: { totalGrams: "0", byBatch: [] },
    financials: {
      revenueKopecks: "0",
      costOfSoldKopecks: "0",
      costOfShortageKopecks: "0",
      grossProfitKopecks: "0",
    },
  };
  return { ...base, ...overrides };
}

describe("aggregateTripSalesByProductLine", () => {
  it("склеивает две партии одного товар·калибр", () => {
    const report = minimalReport({
      sales: {
        ...minimalReport().sales,
        byBatch: [
          {
            batchId: "b1",
            grams: "2000",
            packageCount: "4",
            revenueKopecks: "10000",
            cashKopecks: "10000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
          {
            batchId: "b2",
            grams: "1000",
            packageCount: "2",
            revenueKopecks: "5000",
            cashKopecks: "0",
            debtKopecks: "5000",
            cardTransferKopecks: "0",
          },
        ],
      },
    });
    const map = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Помидоры", "5")],
      ["b2", batch("b2", "Помидоры", "5")],
    ]);
    const rows = aggregateTripSalesByProductLine(report, map);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lineLabel).toBe("Помидоры · 5");
    expect(rows[0]!.grams).toBe(3000n);
    expect(rows[0]!.packages).toBe(6n);
    expect(rows[0]!.revenue).toBe(15000n);
    expect(rows[0]!.cash).toBe(10000n);
    expect(rows[0]!.debt).toBe(5000n);
  });

  it("склеивает партии с одним калибром из разных накладных", () => {
    const report = minimalReport({
      sales: {
        ...minimalReport().sales,
        byBatch: [
          {
            batchId: "b1",
            grams: "1000000",
            revenueKopecks: "200000000",
            cashKopecks: "200000000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
          {
            batchId: "b2",
            grams: "500000",
            revenueKopecks: "200000000",
            cashKopecks: "0",
            debtKopecks: "200000000",
            cardTransferKopecks: "0",
          },
        ],
      },
    });
    const map = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Помидоры", "№5")],
      ["b2", batch("b2", "Помидоры", "№5")],
    ]);
    map.get("b2")!.nakladnaya!.documentNumber = "Умар";
    const rows = aggregateTripSalesByProductLine(report, map);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revenue).toBe(400000000n);
    expect(rows[0]!.grams).toBe(1500000n);
  });

  it("фильтрует по каналу розница", () => {
    const report = minimalReport({
      sales: {
        ...minimalReport().sales,
        byBatch: [
          {
            batchId: "b1",
            grams: "2000",
            revenueKopecks: "10000",
            cashKopecks: "10000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
          {
            batchId: "b2",
            grams: "1000",
            revenueKopecks: "5000",
            cashKopecks: "5000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
        ],
        retailByBatch: [
          {
            batchId: "b1",
            grams: "2000",
            revenueKopecks: "10000",
            cashKopecks: "10000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
        ],
        wholesaleByBatch: [
          {
            batchId: "b2",
            grams: "1000",
            revenueKopecks: "5000",
            cashKopecks: "5000",
            debtKopecks: "0",
            cardTransferKopecks: "0",
          },
        ],
      },
    });
    const map = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Помидоры", "5")],
      ["b2", batch("b2", "Огурцы", "3")],
    ]);
    const retail = aggregateTripSalesByProductLine(report, map, "retail");
    expect(retail).toHaveLength(1);
    expect(retail[0]!.lineLabel).toBe("Помидоры · 5");
    const wholesale = aggregateTripSalesByProductLine(report, map, "wholesale");
    expect(wholesale).toHaveLength(1);
    expect(wholesale[0]!.lineLabel).toBe("Огурцы · 3");
  });
});
