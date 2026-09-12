import { describe, expect, it } from "vitest";

import {
  grossGramsFromNet,
  InvalidPackageTareError,
  netGramsFromGross,
  PRODUCT_GROUP_CUCUMBERS,
  TARE_GRAMS_CUCUMBERS_PER_PACKAGE,
  TARE_GRAMS_PER_PACKAGE,
  tareGramsPerPackageForProductGroup,
} from "./package-tare.js";

describe("package tare", () => {
  it("константы: помидоры 500 г, огурцы 400 г", () => {
    expect(TARE_GRAMS_PER_PACKAGE).toBe(500n);
    expect(TARE_GRAMS_CUCUMBERS_PER_PACKAGE).toBe(400n);
    expect(tareGramsPerPackageForProductGroup("Помидоры")).toBe(500n);
    expect(tareGramsPerPackageForProductGroup(PRODUCT_GROUP_CUCUMBERS)).toBe(400n);
    expect(tareGramsPerPackageForProductGroup(null)).toBe(500n);
  });

  it("без ящиков нетто = брутто", () => {
    expect(netGramsFromGross(100_000n, 0)).toBe(100_000n);
    expect(netGramsFromGross(100_000n, null)).toBe(100_000n);
    expect(grossGramsFromNet(100_000n, 0)).toBe(100_000n);
  });

  it("помидоры: 100 кг брутто + 10 ящ → 95 кг нетто", () => {
    expect(netGramsFromGross(100_000n, 10)).toBe(95_000n);
    expect(grossGramsFromNet(95_000n, 10)).toBe(100_000n);
  });

  it("огурцы: 100 кг брутто + 10 ящ → 96 кг нетто", () => {
    expect(netGramsFromGross(100_000n, 10, TARE_GRAMS_CUCUMBERS_PER_PACKAGE)).toBe(96_000n);
    expect(grossGramsFromNet(96_000n, 10, TARE_GRAMS_CUCUMBERS_PER_PACKAGE)).toBe(100_000n);
  });

  it("ошибка если тара съедает всю массу", () => {
    expect(() => netGramsFromGross(5_000n, 10)).toThrow(InvalidPackageTareError);
    expect(() => netGramsFromGross(5_000n, 10)).toThrow(/net_grams_non_positive/);
  });
});
