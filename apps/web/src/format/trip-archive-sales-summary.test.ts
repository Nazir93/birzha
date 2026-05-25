import { describe, expect, it } from "vitest";

import type { ShipmentReportResponse } from "../api/types.js";

import { formatTripArchiveSalesRevenue, formatTripArchiveSalesSoldKg } from "./trip-archive-sales-summary.js";

function report(sales: Partial<ShipmentReportResponse["sales"]>): ShipmentReportResponse {
  return {
    trip: { id: "t1", tripNumber: "1", status: "closed", vehicleLabel: null, driverName: null, departedAt: null, assignedSellerUserId: null },
    shipment: { totalGrams: "0", totalPackageCount: "0", byBatch: [] },
    sales: {
      totalGrams: "0",
      totalPackageCount: "0",
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
      retailByBatch: [],
      wholesaleByBatch: [],
      retailByClient: [],
      wholesaleByClient: [],
      ...sales,
    },
    shortage: { totalGrams: "0", byBatch: [] },
    financials: {
      revenueKopecks: "0",
      costOfSoldKopecks: "0",
      costOfShortageKopecks: "0",
      grossProfitKopecks: "0",
    },
  };
}

describe("trip-archive-sales-summary", () => {
  it("форматирует итоги для таблицы архива", () => {
    const r = report({ totalGrams: "12500", totalRevenueKopecks: "150000" });
    expect(formatTripArchiveSalesSoldKg(r, false)).toBe("12,500 кг");
    expect(formatTripArchiveSalesRevenue(r, false)).toContain("1");
  });

  it("пока грузится — многоточие", () => {
    expect(formatTripArchiveSalesSoldKg(undefined, true)).toBe("…");
  });
});
