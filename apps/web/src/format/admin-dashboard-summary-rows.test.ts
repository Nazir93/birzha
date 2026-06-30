import { describe, expect, it } from "vitest";

import {
  buildMassSegments,
  gradeTableRows,
  productGroupTableRows,
  summaryTableMaxKg,
  warehouseTableRows,
} from "./admin-dashboard-summary-rows.js";

describe("admin-dashboard-summary-rows", () => {
  it("gradeTableRows — подпись калибра и вид товара", () => {
    const rows = gradeTableRows([
      {
        productGradeId: "g1",
        code: "№5",
        displayName: "Калибр №5",
        productGroup: "Помидоры",
        kg: 500,
        packages: 40,
        valueKopecks: "1000000",
      },
    ]);
    expect(rows[0]!.label).toBe("№5");
    expect(rows[0]!.sublabel).toBe("Помидоры");
    expect(rows[0]!.packages).toBe(40);
  });

  it("warehouseTableRows — имя склада", () => {
    const rows = warehouseTableRows([
      {
        warehouseId: "wh1",
        warehouseName: "  Манас  ",
        kg: 100,
        packages: 10,
        valueKopecks: "50000",
      },
    ]);
    expect(rows[0]!.label).toBe("Манас");
  });

  it("productGroupTableRows", () => {
    const rows = productGroupTableRows([
      { productGroup: "Огурцы", kg: 200, packages: 20, valueKopecks: "400000" },
    ]);
    expect(rows[0]!.label).toBe("Огурцы");
  });

  it("buildMassSegments — четыре этапа баланса", () => {
    const segs = buildMassSegments({
      warehouseKg: 100,
      loadingManifestKg: 50,
      inTripRemainingKg: 30,
      soldKg: 20,
    });
    expect(segs).toHaveLength(4);
    expect(segs.map((s) => s.label)).toEqual(["На складе", "Погрузка", "В рейсе", "Продано"]);
    expect(segs[0]!.kg).toBe(100);
  });

  it("summaryTableMaxKg — первый после сортировки API", () => {
    expect(summaryTableMaxKg([{ key: "a", label: "A", kg: 500, packages: 1, valueKopecks: "0" }])).toBe(500);
    expect(summaryTableMaxKg([])).toBe(0);
  });
});
