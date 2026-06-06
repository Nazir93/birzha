import { describe, expect, it } from "vitest";

import type { ShipmentReportResponse } from "../api/types.js";
import { batchIdsFromShipmentReport } from "./shipment-report-batch-ids.js";

function report(partial: Partial<ShipmentReportResponse>): ShipmentReportResponse {
  return {
    trip: { id: "t1", tripNumber: "1", status: "open", assignedSellerUserId: null, vehicleLabel: null, driverName: null, departedAt: null },
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
    financials: { revenueKopecks: "0", costOfSoldKopecks: "0", costOfShortageKopecks: "0", grossProfitKopecks: "0" },
    ...partial,
  };
}

describe("batchIdsFromShipmentReport", () => {
  it("собирает id из shipment, sales и shortage", () => {
    const ids = batchIdsFromShipmentReport(
      report({
        shipment: { totalGrams: "1000", totalPackageCount: "0", byBatch: [{ batchId: "b-ship", grams: "1000", packageCount: "0" }] },
        sales: {
          ...report({}).sales,
          byBatch: [{ batchId: "b-sale", grams: "500", revenueKopecks: "0", cashKopecks: "0", debtKopecks: "0", cardTransferKopecks: "0" }],
        },
        shortage: { totalGrams: "0", byBatch: [{ batchId: "b-short", grams: "0" }] },
      }),
    );
    expect(ids).toEqual(["b-sale", "b-ship", "b-short"]);
  });
});
