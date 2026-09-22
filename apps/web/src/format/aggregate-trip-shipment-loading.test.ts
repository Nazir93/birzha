import { describe, expect, it } from "vitest";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";

import {
  aggregateTripShipmentByCaliber,
  averagePurchaseRubPerKgLabel,
  shipmentPurchaseCostKopecks,
} from "./aggregate-trip-shipment-loading.js";

function batch(id: string, group: string, grade: string, pricePerKg: number): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg,
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
      supplierName: "Иван",
    },
  };
}

function minimalReport(overrides: Partial<ShipmentReportResponse> = {}): ShipmentReportResponse {
  const base: ShipmentReportResponse = {
    trip: { id: "t1", tripNumber: "Р-1", status: "open", vehicleLabel: "А123ВС" },
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

describe("shipmentPurchaseCostKopecks", () => {
  it("считает 10 кг × 50 ₽ = 500 ₽", () => {
    expect(shipmentPurchaseCostKopecks(10_000n, 50)).toBe(50_000n);
  });
});

describe("aggregateTripShipmentByCaliber", () => {
  it("складывает калибры и суммы закупа", () => {
    const map = new Map([
      ["b1", batch("b1", "Помидоры", "№5", 40)],
      ["b2", batch("b2", "Помидоры", "№5", 40)],
      ["b3", batch("b3", "Помидоры", "№6", 50)],
    ]);
    const report = minimalReport({
      shipment: {
        totalGrams: "6000",
        totalPackageCount: "12",
        byBatch: [
          { batchId: "b1", grams: "2000", packageCount: "4" },
          { batchId: "b2", grams: "1000", packageCount: "2" },
          { batchId: "b3", grams: "3000", packageCount: "6" },
        ],
      },
    });
    const summary = aggregateTripShipmentByCaliber(report, map);
    expect(summary.rows).toHaveLength(2);
    const n5 = summary.rows.find((r) => r.lineLabel.includes("№5"));
    const n6 = summary.rows.find((r) => r.lineLabel.includes("№6"));
    expect(n5?.grams).toBe(3000n);
    expect(n5?.packages).toBe(6n);
    expect(n5?.costKopecks).toBe(12_000n);
    expect(n6?.grams).toBe(3000n);
    expect(n6?.costKopecks).toBe(15_000n);
    expect(summary.totalCostKopecks).toBe(27_000n);
  });

  it("партии без калибра склеивает в одну строку", () => {
    const report = minimalReport({
      shipment: {
        totalGrams: "3000",
        totalPackageCount: "3",
        byBatch: [
          { batchId: "x1", grams: "1000", packageCount: "1" },
          { batchId: "x2", grams: "2000", packageCount: "2" },
        ],
      },
    });
    const summary = aggregateTripShipmentByCaliber(report, new Map());
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]?.lineLabel).toBe("Калибр не указан");
    expect(summary.rows[0]?.grams).toBe(3000n);
  });
});

describe("averagePurchaseRubPerKgLabel", () => {
  it("даёт среднюю цену", () => {
    expect(averagePurchaseRubPerKgLabel(3000n, 12_000n)).toBe("40,00");
  });
});
