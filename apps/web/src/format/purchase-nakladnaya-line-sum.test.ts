import { describe, expect, it } from "vitest";

import { nakladnayaLineSumFieldFromKgPrice } from "./purchase-nakladnaya-line-sum.js";

describe("nakladnayaLineSumFieldFromKgPrice", () => {
  it("считает сумму строки при валидных кг и цене", () => {
    expect(nakladnayaLineSumFieldFromKgPrice("100", "50")).toBe("5000,00");
    expect(nakladnayaLineSumFieldFromKgPrice("10,5", "3,2")).toBe("33,60");
    expect(nakladnayaLineSumFieldFromKgPrice("12", "40")).toBe("480,00");
  });

  it("возвращает пустую строку, если кг или цена не заданы", () => {
    expect(nakladnayaLineSumFieldFromKgPrice("", "50")).toBe("");
    expect(nakladnayaLineSumFieldFromKgPrice("10", "")).toBe("");
    expect(nakladnayaLineSumFieldFromKgPrice("", "")).toBe("");
  });

  it("пересчитывает при изменении одного из полей", () => {
    expect(nakladnayaLineSumFieldFromKgPrice("10", "40")).toBe("400,00");
    expect(nakladnayaLineSumFieldFromKgPrice("15", "40")).toBe("600,00");
    expect(nakladnayaLineSumFieldFromKgPrice("15", "50")).toBe("750,00");
  });
});
