import { describe, expect, it } from "vitest";

import { gramsToKg, kgToGrams } from "./mass.js";

describe("mass", () => {
  it("кг → граммы округляет до целого", () => {
    expect(kgToGrams(1.234)).toBe(1234n);
    expect(kgToGrams(10)).toBe(10000n);
  });

  it("кг ↔ граммы обратимо для типичных значений", () => {
    expect(gramsToKg(kgToGrams(1.234))).toBeCloseTo(1.234, 3);
    expect(gramsToKg(1234n)).toBe(1.234);
  });
});
