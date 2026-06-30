import { describe, expect, it } from "vitest";

import {
  gramsToKg,
  mapGradeStockRows,
  mapProductGroupStockRows,
  mapWarehouseStockRows,
  proportionalPackageCount,
  remainingValueKopecks,
} from "./admin-dashboard-summary-map.js";

describe("admin dashboard stock formulas", () => {
  it("proportionalPackageCount — ящики по доле остатка", () => {
    expect(proportionalPackageCount(800_000n, 1_000_000n, 100n)).toBe(80);
    expect(proportionalPackageCount(500_000n, 500_000n, 40n)).toBe(40);
    expect(proportionalPackageCount(100_000n, 0n, 10n)).toBe(0);
    expect(proportionalPackageCount(100_000n, 500_000n, null)).toBe(0);
  });

  it("remainingValueKopecks — кг × ₽/кг → копейки", () => {
    expect(remainingValueKopecks(500_000n, "20")).toBe(1_000_000n);
    expect(remainingValueKopecks(500_000n, 30)).toBe(1_500_000n);
  });

  it("gramsToKg", () => {
    expect(gramsToKg(1_500_000n)).toBe(1500);
    expect(gramsToKg(null)).toBe(0);
  });
});

describe("mapGradeStockRows", () => {
  it("сортирует по кг и суммирует stockTotals", () => {
    const { byGrade, stockTotals } = mapGradeStockRows([
      {
        productGradeId: "g2",
        code: "№6",
        displayName: "Калибр №6",
        productGroup: "Помидоры",
        grams: 300_000n,
        packages: 30,
        valueKopecks: 900_000n,
      },
      {
        productGradeId: "g1",
        code: "№5",
        displayName: "Калибр №5",
        productGroup: "Помидоры",
        grams: 500_000n,
        packages: 40.6,
        valueKopecks: 1_000_000n,
      },
    ]);

    expect(byGrade).toHaveLength(2);
    expect(byGrade[0]!.code).toBe("№5");
    expect(byGrade[0]!.kg).toBe(500);
    expect(byGrade[0]!.packages).toBe(41);
    expect(byGrade[1]!.code).toBe("№6");
    expect(stockTotals.kg).toBe(800);
    expect(stockTotals.packages).toBe(71);
    expect(stockTotals.valueKopecks).toBe("1900000");
  });
});

describe("mapWarehouseStockRows", () => {
  it("сортирует склады по кг", () => {
    const rows = mapWarehouseStockRows([
      {
        warehouseId: "wh-b",
        warehouseName: "Б",
        grams: 200_000n,
        packages: 20,
        valueKopecks: 400_000n,
      },
      {
        warehouseId: "wh-a",
        warehouseName: "А",
        grams: 500_000n,
        packages: 50,
        valueKopecks: 1_000_000n,
      },
    ]);
    expect(rows[0]!.warehouseName).toBe("А");
    expect(rows[0]!.kg).toBe(500);
    expect(rows[1]!.kg).toBe(200);
  });
});

describe("mapProductGroupStockRows", () => {
  it("подставляет «Без вида» и строит byProductGroupKg", () => {
    const { byProductGroup, byProductGroupKg } = mapProductGroupStockRows([
      {
        productGroup: null,
        grams: 100_000n,
        packages: 10,
        valueKopecks: 200_000n,
      },
      {
        productGroup: "Помидоры",
        grams: 400_000n,
        packages: 40,
        valueKopecks: 800_000n,
      },
    ]);
    expect(byProductGroup[0]!.productGroup).toBe("Помидоры");
    expect(byProductGroup[1]!.productGroup).toBe("Без вида");
    expect(byProductGroupKg["Помидоры"]).toBe(400);
    expect(byProductGroupKg["Без вида"]).toBe(100);
  });
});
