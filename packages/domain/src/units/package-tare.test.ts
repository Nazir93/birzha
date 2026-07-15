import { describe, expect, it } from "vitest";

import {
  grossGramsFromNet,
  InvalidPackageTareError,
  netGramsFromGross,
  TARE_GRAMS_PER_PACKAGE,
} from "./package-tare.js";

describe("package tare 0.5 kg", () => {
  it("константа 500 г", () => {
    expect(TARE_GRAMS_PER_PACKAGE).toBe(500n);
  });

  it("без ящиков нетто = брутто", () => {
    expect(netGramsFromGross(100_000n, 0)).toBe(100_000n);
    expect(netGramsFromGross(100_000n, null)).toBe(100_000n);
    expect(grossGramsFromNet(100_000n, 0)).toBe(100_000n);
  });

  it("100 кг брутто + 10 ящ → 95 кг нетто", () => {
    expect(netGramsFromGross(100_000n, 10)).toBe(95_000n);
    expect(grossGramsFromNet(95_000n, 10)).toBe(100_000n);
  });

  it("ошибка если тара съедает всю массу", () => {
    expect(() => netGramsFromGross(5_000n, 10)).toThrow(InvalidPackageTareError);
    expect(() => netGramsFromGross(5_000n, 10)).toThrow(/net_grams_non_positive/);
  });
});
