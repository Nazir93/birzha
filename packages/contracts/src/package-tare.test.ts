import { describe, expect, it } from "vitest";

import {
  grossKgFromNetKg,
  netKgFromGrossKg,
  PRODUCT_GROUP_CUCUMBERS,
  TARE_GRAMS_CUCUMBERS_PER_PACKAGE,
  TARE_GRAMS_PER_PACKAGE,
  TARE_KG_PER_PACKAGE,
  tareGramsPerPackageForProductGroup,
} from "./package-tare.js";

describe("package-tare kg helpers", () => {
  it("константы: помидоры 0,5 кг, огурцы 0,4 кг", () => {
    expect(TARE_KG_PER_PACKAGE).toBe(0.5);
    expect(TARE_GRAMS_PER_PACKAGE).toBe(500);
    expect(tareGramsPerPackageForProductGroup("Помидоры")).toBe(500);
    expect(tareGramsPerPackageForProductGroup(PRODUCT_GROUP_CUCUMBERS)).toBe(400);
  });

  it("помидоры: 100 кг брутто + 10 ящ → 95 кг нетто", () => {
    expect(netKgFromGrossKg(100, 10)).toBe(95);
    expect(grossKgFromNetKg(95, 10)).toBe(100);
  });

  it("огурцы: 100 кг брутто + 10 ящ → 96 кг нетто", () => {
    expect(netKgFromGrossKg(100, 10, TARE_GRAMS_CUCUMBERS_PER_PACKAGE)).toBe(96);
    expect(grossKgFromNetKg(96, 10, TARE_GRAMS_CUCUMBERS_PER_PACKAGE)).toBe(100);
  });

  it("без ящиков — равенство", () => {
    expect(netKgFromGrossKg(12.5, 0)).toBe(12.5);
    expect(grossKgFromNetKg(12.5, null)).toBe(12.5);
  });

  it("ошибка если тара ≥ брутто", () => {
    expect(() => netKgFromGrossKg(5, 10)).toThrow(/net_kg_non_positive/);
  });
});
