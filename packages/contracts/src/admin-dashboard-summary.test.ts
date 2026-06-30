import { describe, expect, it } from "vitest";

import { adminDashboardSummaryResponseSchema } from "./admin-dashboard-summary.js";

describe("adminDashboardSummaryResponseSchema", () => {
  it("принимает расширенный ответ сводки", () => {
    const parsed = adminDashboardSummaryResponseSchema.parse({
      trips: {
        openCount: 1,
        closedCount: 2,
        shippedKg: 100,
        soldKg: 40,
        remainingInTripKg: 55,
        shortageKg: 5,
      },
      warehouse: {
        warehouseKg: 200,
        batchCount: 3,
        inTransitKg: 50,
        pendingInboundKg: 10,
        byWarehouseKg: { A: 200 },
        byProductGroupKg: { Tomatoes: 260 },
        stockTotals: { kg: 260, packages: 20, valueKopecks: "100000" },
        byGrade: [],
        byWarehouse: [],
        byProductGroup: [],
      },
      loadingManifests: {
        activeCount: 1,
        withoutTripCount: 1,
        withoutTripKg: 30,
        activeKg: 80,
      },
      attention: {
        unassignedOpenTripsCount: 2,
      },
    });
    expect(parsed.trips.shortageKg).toBe(5);
    expect(parsed.attention.unassignedOpenTripsCount).toBe(2);
  });
});
