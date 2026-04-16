import { describe, expect, it } from "vitest";

import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "./rub-kopecks.js";

describe("rub-kopecks", () => {
  it("rubPerKgToKopecksPerKg", () => {
    expect(rubPerKgToKopecksPerKg(120.5)).toBe(12050n);
    expect(rubPerKgToKopecksPerKg(0)).toBe(0n);
  });

  it("revenueKopecksFromGramsAndPricePerKg", () => {
    expect(revenueKopecksFromGramsAndPricePerKg(50_000n, 1200n)).toBe(60_000n);
  });
});
