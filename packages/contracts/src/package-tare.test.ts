import { describe, expect, it } from "vitest";

import {
  grossKgFromNetKg,
  netKgFromGrossKg,
  TARE_GRAMS_PER_PACKAGE,
  TARE_KG_PER_PACKAGE,
} from "./package-tare.js";

describe("package-tare kg helpers", () => {
  it("0.5 кг константа", () => {
    expect(TARE_KG_PER_PACKAGE).toBe(0.5);
    expect(TARE_GRAMS_PER_PACKAGE).toBe(500);
  });

  it("100 кг брутто + 10 ящ → 95 кг нетто", () => {
    expect(netKgFromGrossKg(100, 10)).toBe(95);
    expect(grossKgFromNetKg(95, 10)).toBe(100);
  });

  it("без ящиков — равенство", () => {
    expect(netKgFromGrossKg(12.5, 0)).toBe(12.5);
    expect(grossKgFromNetKg(12.5, null)).toBe(12.5);
  });

  it("ошибка если тара ≥ брутто", () => {
    expect(() => netKgFromGrossKg(5, 10)).toThrow(/net_kg_non_positive/);
  });
});
