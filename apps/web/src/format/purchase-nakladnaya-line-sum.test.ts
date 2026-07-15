import { describe, expect, it } from "vitest";

import {
  nakladnayaLineSumFieldFromGrossKgPrice,
  nakladnayaLineSumFieldFromKgPrice,
  nakladnayaNetKgFieldFromGross,
  purchaseLineDisplayGrossKg,
} from "./purchase-nakladnaya-line-sum.js";

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

describe("nakladnayaNetKgFieldFromGross", () => {
  it("считает нетто: брутто − 0,5×ящ.", () => {
    expect(nakladnayaNetKgFieldFromGross("10", "2")).toBe("9");
    expect(nakladnayaNetKgFieldFromGross("12,5", "0")).toBe("12,5");
    expect(nakladnayaNetKgFieldFromGross("100", "10")).toBe("95");
  });

  it("пусто при нетто ≤ 0 или пустом брутто", () => {
    expect(nakladnayaNetKgFieldFromGross("1", "2")).toBe("");
    expect(nakladnayaNetKgFieldFromGross("", "1")).toBe("");
  });
});

describe("nakladnayaLineSumFieldFromGrossKgPrice", () => {
  it("сумма от нетто × цены (не от брутто)", () => {
    // брутто 10, 2 ящ. → нетто 9 × 50 = 450
    expect(nakladnayaLineSumFieldFromGrossKgPrice("10", "2", "50")).toBe("450,00");
    // без ящиков брутто = нетто
    expect(nakladnayaLineSumFieldFromGrossKgPrice("10", "", "50")).toBe("500,00");
  });

  it("пусто, если нетто нельзя посчитать", () => {
    expect(nakladnayaLineSumFieldFromGrossKgPrice("1", "2", "50")).toBe("");
    expect(nakladnayaLineSumFieldFromGrossKgPrice("", "1", "50")).toBe("");
  });
});

describe("purchaseLineDisplayGrossKg", () => {
  it("берёт сохранённое брутто", () => {
    expect(purchaseLineDisplayGrossKg(100, 95, "10")).toBe(100);
  });

  it("без сохранённого брутто: нетто + 0,5×ящ.", () => {
    expect(purchaseLineDisplayGrossKg(null, 95, "10")).toBe(100);
    expect(purchaseLineDisplayGrossKg(undefined, 12.5, "")).toBe(12.5);
    expect(purchaseLineDisplayGrossKg(0, 9, "2")).toBe(10);
  });
});
