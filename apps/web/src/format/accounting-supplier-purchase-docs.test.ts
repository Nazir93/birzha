import { describe, expect, it } from "vitest";

import type { PurchaseDocumentSummary } from "../api/types.js";
import { groupPurchaseDocumentsBySupplier } from "./accounting-supplier-purchase-docs.js";

function doc(
  p: Partial<PurchaseDocumentSummary> & Pick<PurchaseDocumentSummary, "id" | "documentNumber">,
): PurchaseDocumentSummary {
  return {
    docDate: "2026-09-01",
    warehouseId: "wh-1",
    lineCount: 1,
    createdByUserId: null,
    totalKg: 0,
    linesTotalKopecks: "0",
    extraCostKopecks: "0",
    documentTotalKopecks: "0",
    ...p,
  };
}

describe("groupPurchaseDocumentsBySupplier", () => {
  it("группирует накладные по тепличнику и суммирует кг/деньги", () => {
    const groups = groupPurchaseDocumentsBySupplier([
      doc({
        id: "d1",
        documentNumber: "Мурад-1",
        supplierId: "s1",
        supplierName: "Мурад 7",
        warehouseName: "Манас",
        totalKg: 1000,
        documentTotalKopecks: "100000",
      }),
      doc({
        id: "d2",
        documentNumber: "Мурад-2",
        supplierId: "s1",
        supplierName: "Мурад 7",
        warehouseName: "Дербент",
        totalKg: 500,
        documentTotalKopecks: "50000",
      }),
      doc({
        id: "d3",
        documentNumber: "Назим-1",
        supplierName: "Назим 8",
        totalKg: 200,
        documentTotalKopecks: "20000",
      }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.supplierName).toBe("Мурад 7");
    expect(groups[0]?.documents).toHaveLength(2);
    expect(groups[0]?.totalKg).toBe(1500);
    expect(groups[0]?.totalKopecks).toBe(150000n);
    expect(groups[1]?.supplierName).toBe("Назим 8");
  });

  it("без имени — группа «Без тепличника»", () => {
    const groups = groupPurchaseDocumentsBySupplier([doc({ id: "x", documentNumber: "1" })]);
    expect(groups[0]?.supplierName).toBe("Без тепличника");
  });
});
