import { describe, expect, it } from "vitest";

import type { BatchListItem, ShipmentReportResponse } from "../api/types.js";

import {
  aggregateTripShipmentByCaliber,
  buildTripShipmentDetailRows,
} from "./aggregate-trip-shipment-loading.js";

function batch(id: string, group: string, grade: string, supplier = "Иван", doc = "Н-1"): BatchListItem {
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
      documentNumber: doc,
      warehouseId: "w1",
      productGroup: group,
      productGradeCode: grade,
      supplierName: supplier,
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

describe("aggregateTripShipmentByCaliber", () => {
  it("складывает одинаковые калибры из разных партий", () => {
    const map = new Map([
      ["b1", batch("b1", "Помидоры", "№5")],
      ["b2", batch("b2", "Помидоры", "№5", "Пётр", "Н-2")],
      ["b3", batch("b3", "Огурцы", "НС+")],
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
    const rows = aggregateTripShipmentByCaliber(report, map);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.lineLabel).toContain("Огурцы");
    expect(rows[0]?.grams).toBe(3000n);
    expect(rows[0]?.packages).toBe(6n);
    expect(rows[1]?.lineLabel).toContain("Помидоры");
    expect(rows[1]?.grams).toBe(3000n);
    expect(rows[1]?.packages).toBe(6n);
  });
});

describe("buildTripShipmentDetailRows", () => {
  it("даёт по строке на партию с тепличником и накладной", () => {
    const map = new Map([
      ["b1", batch("b1", "Помидоры", "№5", "Иван", "Н-1")],
      ["b2", batch("b2", "Помидоры", "№5", "Пётр", "Н-2")],
    ]);
    const report = minimalReport({
      shipment: {
        totalGrams: "3000",
        totalPackageCount: "6",
        byBatch: [
          { batchId: "b1", grams: "2000", packageCount: "4" },
          { batchId: "b2", grams: "1000", packageCount: "2" },
        ],
      },
    });
    const rows = buildTripShipmentDetailRows(report, map);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.supplierName).sort()).toEqual(["Иван", "Пётр"]);
    expect(rows.every((r) => r.caliberLabel.includes("№5"))).toBe(true);
    expect(rows[0]?.lineNo).toBe(1);
    expect(rows[1]?.lineNo).toBe(2);
  });
});
