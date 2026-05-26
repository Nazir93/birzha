import { describe, expect, it } from "vitest";

import type { BatchListItem, TripSaleLineJson } from "../api/types.js";
import { groupTripSaleLinesForCorrections } from "./trip-sale-line-groups.js";

function batch(id: string, group: string, grade: string, doc = "Н-1"): BatchListItem {
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
      documentNumber: doc,
      warehouseId: "w1",
      productGroup: group,
      productGradeCode: grade,
    },
  };
}

function line(overrides: Partial<TripSaleLineJson> & { batchId: string }): TripSaleLineJson {
  return {
    id: overrides.id ?? "l1",
    tripId: "t1",
    batchId: overrides.batchId,
    saleId: overrides.saleId ?? "sale-1",
    kg: overrides.kg ?? "10",
    packageCount: overrides.packageCount ?? null,
    pricePerKgKopecks: overrides.pricePerKgKopecks ?? "10000",
    revenueKopecks: overrides.revenueKopecks ?? "100000",
    cashKopecks: overrides.cashKopecks ?? "100000",
    debtKopecks: overrides.debtKopecks ?? "0",
    cardTransferKopecks: overrides.cardTransferKopecks ?? "0",
    saleChannel: overrides.saleChannel ?? "retail",
    clientLabel: overrides.clientLabel ?? null,
    wholesaleBuyerId: overrides.wholesaleBuyerId ?? null,
    recordedAt: overrides.recordedAt ?? "2026-05-19T12:00:00.000Z",
  };
}

describe("groupTripSaleLinesForCorrections", () => {
  it("склеивает две строки одной продажи по калибру (разные партии)", () => {
    const batchById = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Томат", "5", "Н-10")],
      ["b2", batch("b2", "Томат", "5", "Н-11")],
    ]);
    const lines = [
      line({ id: "l1", batchId: "b1", kg: "200", packageCount: "200", revenueKopecks: "2000000" }),
      line({ id: "l2", batchId: "b2", kg: "43", packageCount: "43", revenueKopecks: "430000" }),
    ];
    const g = groupTripSaleLinesForCorrections(lines, batchById);
    expect(g).toHaveLength(1);
    expect(g[0]!.lineLabel).toBe("Томат · 5");
    expect(g[0]!.totalKg).toBe("243");
    expect(g[0]!.totalPackages).toBe("243");
    expect(g[0]!.lines).toHaveLength(2);
  });

  it("склеивает части с разными saleId (старые продажи до общего saleId)", () => {
    const batchById = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Томат", "5")],
      ["b2", batch("b2", "Томат", "5")],
    ]);
    const lines = [
      line({ id: "l1", batchId: "b1", saleId: "s-a", kg: "100", packageCount: "100" }),
      line({ id: "l2", batchId: "b2", saleId: "s-b", kg: "143", packageCount: "143" }),
    ];
    const g = groupTripSaleLinesForCorrections(lines, batchById);
    expect(g).toHaveLength(1);
    expect(g[0]!.totalPackages).toBe("243");
  });

  it("разные калибры — две группы", () => {
    const batchById = new Map<string, BatchListItem>([
      ["b1", batch("b1", "Томат", "5")],
      ["b2", batch("b2", "Томат", "6")],
    ]);
    const lines = [
      line({ id: "l1", batchId: "b1", saleId: "s1" }),
      line({ id: "l2", batchId: "b2", saleId: "s2" }),
    ];
    const g = groupTripSaleLinesForCorrections(lines, batchById);
    expect(g).toHaveLength(2);
  });
});
