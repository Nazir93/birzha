import { describe, expect, it } from "vitest";

import {
  nonnegativeDecimalStringToNumber,
  numberToDecimalStringForKopecks,
  purchaseLineAmountKopecksFromDecimalStrings,
} from "./purchase-line-kopecks.js";

describe("purchaseLineAmountKopecksFromDecimalStrings", () => {
  it("целые кг и цена", () => {
    expect(purchaseLineAmountKopecksFromDecimalStrings("10", "50")).toBe(50_000);
  });

  it("запятая и дроби (бух. точность)", () => {
    expect(purchaseLineAmountKopecksFromDecimalStrings("10,5", "3,2")).toBe(3360);
    expect(purchaseLineAmountKopecksFromDecimalStrings("1,234", "100")).toBe(12_340);
  });

  it("не полагается на float 0.1+0.2", () => {
    const k = purchaseLineAmountKopecksFromDecimalStrings("0.2", "0.2");
    expect(k).toBe(4);
  });

  it("копейки в цене за кг", () => {
    expect(purchaseLineAmountKopecksFromDecimalStrings("100", "45,67")).toBe(456_700);
  });

  it("согласованность с numberToDecimalStringForKopecks на сервере", () => {
    const kg = 12.3456789;
    const pr = 88.1255;
    const k = purchaseLineAmountKopecksFromDecimalStrings(
      numberToDecimalStringForKopecks(kg, 6),
      numberToDecimalStringForKopecks(pr, 4),
    );
    expect(k).toBeGreaterThan(0);
    expect(Number.isInteger(k)).toBe(true);
  });
});

describe("nonnegativeDecimalStringToNumber", () => {
  it("парсит с запятой", () => {
    expect(nonnegativeDecimalStringToNumber("10,5", 6)).toBe(10.5);
  });
});
