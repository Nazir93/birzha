import { describe, expect, it } from "vitest";

import {
  totalsByGradeFromNakladnayaBatches,
  totalsByGradeFromNakladnayaFormLines,
  totalsByGradeFromPurchaseDocumentLines,
} from "./purchase-nakladnaya-totals-by-grade.js";

describe("totalsByGradeFromPurchaseDocumentLines", () => {
  it("суммирует строки с одним калибром", () => {
    const r = totalsByGradeFromPurchaseDocumentLines([
      {
        lineNo: 1,
        productGradeId: "g1",
        productGradeCode: "L",
        batchId: "b1",
        totalKg: 10,
        packageCount: "2",
        pricePerKg: 50,
        lineTotalKopecks: "500000",
      },
      {
        lineNo: 2,
        productGradeId: "g1",
        productGradeCode: "L",
        batchId: "b2",
        totalKg: 5,
        packageCount: "1",
        pricePerKg: 50,
        lineTotalKopecks: "250000",
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.gradeCode).toBe("L");
    expect(r[0]!.totalKg).toBe(15);
    expect(r[0]!.totalPackages).toBe(3);
    expect(r[0]!.lineKopSum).toBe(750000);
  });
});

describe("totalsByGradeFromNakladnayaFormLines", () => {
  it("группирует по productGradeId", () => {
    const r = totalsByGradeFromNakladnayaFormLines(
      [
        {
          productGradeId: "x",
          totalKg: "1",
          packageCount: "",
          lineTotalKopecks: "100",
        },
        {
          productGradeId: "x",
          totalKg: "2",
          packageCount: "",
          lineTotalKopecks: "200",
        },
      ],
      (id) => (id === "x" ? "X-grade" : "—"),
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.label).toBe("X-grade");
    expect(r[0]!.totalKg).toBe(3);
    expect(r[0]!.lineKopSum).toBe(300);
  });
});

describe("totalsByGradeFromNakladnayaBatches", () => {
  it("суммирует кг по productGradeCode", () => {
    const r = totalsByGradeFromNakladnayaBatches([
      {
        id: "1",
        purchaseId: "p",
        totalKg: 10,
        pricePerKg: 1,
        pendingInboundKg: 0,
        onWarehouseKg: 4,
        inTransitKg: 1,
        soldKg: 2,
        writtenOffKg: 0,
        nakladnaya: { documentId: "d", warehouseId: null, productGradeCode: "M", productGroup: null, documentNumber: "1" },
      },
      {
        id: "2",
        purchaseId: "p",
        totalKg: 5,
        pricePerKg: 1,
        pendingInboundKg: 0,
        onWarehouseKg: 3,
        inTransitKg: 0,
        soldKg: 1,
        writtenOffKg: 0,
        nakladnaya: { documentId: "d", warehouseId: null, productGradeCode: "M", productGroup: null, documentNumber: "1" },
      },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.gradeCode).toBe("M");
    expect(r[0]!.onWarehouseKg).toBe(7);
    expect(r[0]!.soldKg).toBe(3);
  });
});
