import { describe, expect, it } from "vitest";

import {
  gramsToKg,
  mapGradeStockRows,
  mapProductGroupStockRows,
  mapWarehouseStockRows,
  mapWarehouseWithGradeStockRows,
  proportionalPackageCount,
  remainingValueKopecks,
  sortMappedGradeStockRows,
  sumKopecks,
  toKopecksBigInt,
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

  it("sumKopecks — строки из PostgreSQL не склеиваются", () => {
    expect(sumKopecks(["2200000", "800000", "1000000"])).toBe(4_000_000n);
    expect(toKopecksBigInt("2200000")).toBe(2_200_000n);
  });
});

describe("mapGradeStockRows", () => {
  it("сортирует по канону калибров (не по кг) и суммирует stockTotals", () => {
    const { byGrade, stockTotals } = mapGradeStockRows([
      {
        productGradeId: "g2",
        code: "№6",
        displayName: "Калибр №6",
        productGroup: "Помидоры",
        grams: 600_000n,
        packages: 60,
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
    expect(stockTotals.kg).toBe(1100);
    expect(stockTotals.packages).toBe(101);
    expect(stockTotals.valueKopecks).toBe("1900000");
  });

  it("mapGradeStockRows — valueKopecks-строки из SQL суммируются", () => {
    const { stockTotals } = mapGradeStockRows([
      {
        productGradeId: "g1",
        code: "№6",
        displayName: "Калибр №6",
        productGroup: "Помидоры",
        grams: 2_000_000n,
        packages: 200,
        valueKopecks: "2200000" as unknown as bigint,
      },
      {
        productGradeId: "g2",
        code: "№8",
        displayName: "Калибр №8",
        productGroup: "Помидоры",
        grams: 1_000_000n,
        packages: 100,
        valueKopecks: "800000" as unknown as bigint,
      },
    ]);
    expect(stockTotals.valueKopecks).toBe("3000000");
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
    expect(rows[0]!.byGrade).toEqual([]);
    expect(rows[1]!.kg).toBe(200);
  });
});

describe("mapWarehouseWithGradeStockRows", () => {
  it("группирует калибры по складу и сортирует по канону", () => {
    const rows = mapWarehouseWithGradeStockRows([
      {
        warehouseId: "wh-a",
        warehouseName: "Манас",
        productGradeId: "g2",
        code: "№6",
        displayName: "Калибр №6",
        productGroup: "Помидоры",
        grams: 600_000n,
        packages: 60,
        valueKopecks: 600_000n,
      },
      {
        warehouseId: "wh-a",
        warehouseName: "Манас",
        productGradeId: "g1",
        code: "№5",
        displayName: "Калибр №5",
        productGroup: "Помидоры",
        grams: 500_000n,
        packages: 50,
        valueKopecks: 500_000n,
      },
      {
        warehouseId: "wh-b",
        warehouseName: "Каякент",
        productGradeId: "g3",
        code: "№8",
        displayName: "Калибр №8",
        productGroup: "Огурцы",
        grams: 200_000n,
        packages: 20,
        valueKopecks: 220_000n,
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.warehouseName).toBe("Манас");
    expect(rows[0]!.kg).toBe(1100);
    expect(rows[0]!.byGrade).toHaveLength(2);
    expect(rows[0]!.byGrade[0]!.code).toBe("№5");
    expect(rows[0]!.byGrade[1]!.code).toBe("№6");
    expect(rows[1]!.warehouseName).toBe("Каякент");
    expect(rows[1]!.byGrade[0]!.code).toBe("№8");
  });
});

describe("sortMappedGradeStockRows", () => {
  it("5 → 6 → 7 → 8 → НС+ → НС- → ОМ внутри вида товара", () => {
    const sorted = sortMappedGradeStockRows([
      {
        productGradeId: "g8",
        code: "№8",
        displayName: "№8",
        productGroup: "Помидоры",
        kg: 1,
        packages: 1,
        valueKopecks: "0",
      },
      {
        productGradeId: "gns",
        code: "НС-",
        displayName: "НС-",
        productGroup: "Помидоры",
        kg: 2,
        packages: 1,
        valueKopecks: "0",
      },
      {
        productGradeId: "g6",
        code: "№6",
        displayName: "№6",
        productGroup: "Помидоры",
        kg: 99,
        packages: 1,
        valueKopecks: "0",
      },
      {
        productGradeId: "g5",
        code: "№5",
        displayName: "№5",
        productGroup: "Помидоры",
        kg: 1,
        packages: 1,
        valueKopecks: "0",
      },
    ]);
    expect(sorted.map((r) => r.code)).toEqual(["№5", "№6", "№8", "НС-"]);
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
