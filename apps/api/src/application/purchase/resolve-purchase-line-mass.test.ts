import { describe, expect, it } from "vitest";

import { resolvePurchaseLineMass } from "./resolve-purchase-line-mass.js";

describe("resolvePurchaseLineMass", () => {
  it("брутто 100 кг + 10 ящ → нетто 95 кг в партии и quantity_grams", () => {
    const mass = resolvePurchaseLineMass({ grossKg: 100, packageCount: 10 });

    expect(mass.grossGrams).toBe(100_000n);
    expect(mass.netKg).toBe(95);
    expect(mass.netGrams).toBe(95_000n);
    expect(mass.packageCount).toBe(10n);
  });

  it("без ящиков: нетто = брутто", () => {
    const mass = resolvePurchaseLineMass({ grossKg: 12.5 });
    expect(mass.netGrams).toBe(12_500n);
    expect(mass.grossGrams).toBe(12_500n);
  });
});
