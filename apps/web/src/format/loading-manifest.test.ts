import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  aggregateBatchesByCaliberLine,
  estimatedPackageCountOnShelf,
  filterBatchesForLoadingManifest,
  sumLoadingManifestTotals,
} from "./loading-manifest.js";

function b(p: Partial<BatchListItem> & Pick<BatchListItem, "id" | "onWarehouseKg" | "totalKg">): BatchListItem {
  return {
    purchaseId: "pur",
    pricePerKg: 0,
    pendingInboundKg: 0,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...p,
  };
}

describe("estimatedPackageCountOnShelf", () => {
  it("доля остатка к массе × ящиков в строке накладной", () => {
    const row = b({
      id: "1",
      totalKg: 100,
      onWarehouseKg: 50,
      nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
    });
    expect(estimatedPackageCountOnShelf(row)).toBe(10);
  });

  it("весь остаток — полное число ящиков из строки", () => {
    const row = b({
      id: "2",
      totalKg: 10,
      onWarehouseKg: 10,
      nakladnaya: { linePackageCount: 7 } as BatchListItem["nakladnaya"],
    });
    expect(estimatedPackageCountOnShelf(row)).toBe(7);
  });

  it("без linePackageCount — null", () => {
    const row = b({ id: "3", totalKg: 10, onWarehouseKg: 5, nakladnaya: { productGradeCode: "x" } as BatchListItem["nakladnaya"] });
    expect(estimatedPackageCountOnShelf(row)).toBeNull();
  });
});

describe("filterBatchesForLoadingManifest", () => {
  it("при 0 вариантов накл. — все партии с остатком", () => {
    const batches = [
      b({ id: "a", onWarehouseKg: 1, totalKg: 1, nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"] }),
      b({ id: "b", onWarehouseKg: 0, totalKg: 1, nakladnaya: { documentId: "d2" } as BatchListItem["nakladnaya"] }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 0, new Set());
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("только отмеченные documentId", () => {
    const batches = [
      b({ id: "a", onWarehouseKg: 1, totalKg: 1, nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"] }),
      b({ id: "b", onWarehouseKg: 2, totalKg: 2, nakladnaya: { documentId: "d2" } as BatchListItem["nakladnaya"] }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 2, new Set(["d1"]));
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("строка без documentId в данных — остаётся в списке (не отфильтровать вручную введённое)", () => {
    const batches = [b({ id: "x", onWarehouseKg: 1, totalKg: 1 })];
    const r = filterBatchesForLoadingManifest(batches, 1, new Set(["d1"]));
    expect(r).toHaveLength(1);
  });
});

describe("sumLoadingManifestTotals", () => {
  it("сумма кг и оценка ящиков по участвующим строкам", () => {
    const batches = [
      b({
        id: "1",
        totalKg: 10,
        onWarehouseKg: 5,
        nakladnaya: { linePackageCount: 10 } as BatchListItem["nakladnaya"],
      }),
      b({ id: "2", totalKg: 1, onWarehouseKg: 1, nakladnaya: {} as BatchListItem["nakladnaya"] }),
    ];
    const t = sumLoadingManifestTotals(batches);
    expect(t.kg).toBe(6);
    expect(t.batchCount).toBe(2);
    expect(t.linesWithPkg).toBe(1);
    expect(t.pkg).toBe(5);
  });
});

describe("aggregateBatchesByCaliberLine", () => {
  it("суммирует кг и оценку ящиков по калибру/товарной подписи", () => {
    const batches = [
      b({
        id: "a1",
        totalKg: 100,
        onWarehouseKg: 30,
        nakladnaya: {
          documentId: "d1",
          warehouseId: "w1",
          productGradeCode: "5",
          productGroup: "Том",
          documentNumber: "1",
          linePackageCount: 20,
        } as BatchListItem["nakladnaya"],
      }),
      b({
        id: "a2",
        totalKg: 10,
        onWarehouseKg: 5,
        nakladnaya: {
          documentId: "d1",
          warehouseId: "w1",
          productGradeCode: "5",
          productGroup: "Том",
          documentNumber: "1",
          linePackageCount: 10,
        } as BatchListItem["nakladnaya"],
      }),
    ];
    const g = aggregateBatchesByCaliberLine(batches);
    expect(g).toHaveLength(1);
    expect(g[0]!.lineLabel).toContain("Том");
    expect(g[0]!.lineLabel).toContain("5");
    expect(g[0]!.totalKg).toBe(35);
    expect(g[0]!.partCount).toBe(2);
  });
});
