import { describe, expect, it } from "vitest";

import { gramsToKg, kgToGrams } from "./batch-mass.js";

describe("batch-mass", () => {
  it("кг ↔ граммы обратимо для типичных значений", () => {
    expect(gramsToKg(kgToGrams(1.234))).toBeCloseTo(1.234, 3);
  });
});
