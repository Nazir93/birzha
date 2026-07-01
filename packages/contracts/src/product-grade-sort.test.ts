import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCT_GRADE_ORDER,
  compareProductGradeCodes,
  compareProductGradeLineLabels,
  normalizeProductGradeCodeForSort,
  productGradeSortRank,
} from "./product-grade-sort.js";

describe("productGradeSortRank", () => {
  it("канонический порядок 5–8, НС+, НС-, ОМ", () => {
    const codes = ["Ом.", "НС-", "№8", "НС+", "№5", "№7", "№6"];
    const sorted = [...codes].sort(compareProductGradeCodes);
    expect(sorted).toEqual(["№5", "№6", "№7", "№8", "НС+", "НС-", "Ом."]);
  });

  it("нормализует варианты написания", () => {
    expect(normalizeProductGradeCodeForSort("№5")).toBe("5");
    expect(normalizeProductGradeCodeForSort("Ом.")).toBe("ОМ");
    expect(productGradeSortRank("№8")).toBe(productGradeSortRank("8"));
  });

  it("неизвестные калибры после канонических", () => {
    expect(productGradeSortRank("XL")).toBeGreaterThan(productGradeSortRank("Ом."));
  });
});

describe("compareProductGradeLineLabels", () => {
  it("сортирует по товару, затем по калибру", () => {
    const labels = [
      "Помидоры · НС-",
      "Огурцы · №5",
      "Помидоры · №6",
      "Помидоры · №5",
    ];
    const sorted = [...labels].sort(compareProductGradeLineLabels);
    expect(sorted).toEqual([
      "Огурцы · №5",
      "Помидоры · №5",
      "Помидоры · №6",
      "Помидоры · НС-",
    ]);
  });
});

describe("CANONICAL_PRODUCT_GRADE_ORDER", () => {
  it("фиксирует ожидаемую последовательность", () => {
    expect([...CANONICAL_PRODUCT_GRADE_ORDER]).toEqual(["5", "6", "7", "8", "НС+", "НС-", "ОМ"]);
  });
});
