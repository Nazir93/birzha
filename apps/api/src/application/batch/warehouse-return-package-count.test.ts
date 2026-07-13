import { describe, expect, it } from "vitest";

import { estimateReturnPackageCount } from "./warehouse-return-package-count.js";

describe("estimateReturnPackageCount", () => {
  it("пропорционально массе строки накладной", () => {
    expect(
      estimateReturnPackageCount({
        returnGrams: 500_000n,
        lineQuantityGrams: 1_000_000n,
        linePackageCount: 100n,
      }),
    ).toBe(50);
  });

  it("null без ящиков в строке", () => {
    expect(
      estimateReturnPackageCount({
        returnGrams: 500_000n,
        lineQuantityGrams: 1_000_000n,
        linePackageCount: null,
      }),
    ).toBeNull();
  });
});
