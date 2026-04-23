import { describe, expect, it } from "vitest";

import {
  kopecksFromNakladnayaAmountField,
  kopecksToNakladnayaRubleFieldString,
} from "./nakladnaya-amount-kopecks.js";

describe("kopecksFromNakladnayaAmountField", () => {
  it("число в копейках без сепаратора", () => {
    expect(kopecksFromNakladnayaAmountField("0")).toBe(0);
    expect(kopecksFromNakladnayaAmountField("50 000")).toBe(50_000);
    expect(kopecksFromNakladnayaAmountField("50000")).toBe(50_000);
  });

  it("руб,коп с запятой (точные копийки, без float)", () => {
    expect(kopecksFromNakladnayaAmountField("32232,77")).toBe(3_223_277);
    expect(kopecksFromNakladnayaAmountField("0,5")).toBe(50);
    expect(kopecksFromNakladnayaAmountField("0,05")).toBe(5);
    expect(kopecksFromNakladnayaAmountField("1,2")).toBe(120);
    expect(kopecksFromNakladnayaAmountField("100,00")).toBe(10_000);
  });

  it("точка вместо запятой", () => {
    expect(kopecksFromNakladnayaAmountField("32232.77")).toBe(3_223_277);
  });

  it("больше двух знаков в коп. отбрасывает разбор (без 'округлять' лишние цифры в ущерб точности)", () => {
    expect(kopecksFromNakladnayaAmountField("1,000")).toBeNull();
  });

  it("дробной части > 99 нет (валидация 2 цифры = копейки 0-99)", () => {
    expect(kopecksFromNakladnayaAmountField("0,100")).toBeNull();
  });
});

describe("kopecksToNakladnayaRubleFieldString", () => {
  it("round-trip читаемый ввод", () => {
    expect(kopecksToNakladnayaRubleFieldString(3_223_277)).toBe("32232,77");
    expect(kopecksToNakladnayaRubleFieldString(0)).toBe("0,00");
  });
});
