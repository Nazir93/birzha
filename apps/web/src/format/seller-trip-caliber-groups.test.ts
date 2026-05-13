import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";
import { formatSellerCaliberGroupOptionLabel, groupSellableRowsByCaliber } from "./seller-trip-caliber-groups.js";

function kg(g: bigint): string {
  return (Number(g) / 1000).toString();
}

function batch(id: string, group: string, grade: string): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 0,
    inTransitKg: 10,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "d1",
      documentNumber: "Н-100",
      warehouseId: "w1",
      productGroup: group,
      productGradeCode: grade,
    },
  };
}

describe("groupSellableRowsByCaliber", () => {
  it("склеивает две партии одного калибра", () => {
    const rows: TripBatchTableRow[] = [
      {
        batchId: "b1",
        shippedG: 30_000n,
        shippedPackages: 0n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 20_000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
        cardTransferK: 0n,
      },
      {
        batchId: "b2",
        shippedG: 15_000n,
        shippedPackages: 0n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 10_000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
        cardTransferK: 0n,
      },
    ];
    const map = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Томат", "57")],
      ["b2", batch("b2", "Томат", "57")],
    ]);
    const g = groupSellableRowsByCaliber(rows, map);
    expect(g).toHaveLength(1);
    expect(g[0]!.totalNetG).toBe(30_000n);
    expect(g[0]!.rows).toHaveLength(2);
    expect(g[0]!.primaryBatchId).toBe("b1");
    expect(formatSellerCaliberGroupOptionLabel(g[0]!, kg)).toContain("2 партии");
  });

  it("разные калибры — две группы", () => {
    const rows: TripBatchTableRow[] = [
      {
        batchId: "b1",
        shippedG: 10_000n,
        shippedPackages: 0n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 10_000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
        cardTransferK: 0n,
      },
      {
        batchId: "b2",
        shippedG: 5_000n,
        shippedPackages: 0n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 5_000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
        cardTransferK: 0n,
      },
    ];
    const map = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Томат", "57")],
      ["b2", batch("b2", "Томат", "58")],
    ]);
    const g = groupSellableRowsByCaliber(rows, map);
    expect(g).toHaveLength(2);
  });
});
