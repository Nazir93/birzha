import { describe, expect, it } from "vitest";

import {
  effectiveShippedPackages,
  packagesFromPurchaseProportion,
  tripSaleUsesPackageAccounting,
} from "./trip-package-estimate.js";

describe("trip-package-estimate", () => {
  it("оценивает ящики отгрузки по накладной, если в журнале отгрузки 0", () => {
    const nakladnaya = { linePackageCount: 400n, purchasedGrams: 10_000_000n };
    expect(packagesFromPurchaseProportion(3_000_000n, 10_000_000n, 400n)).toBe(120n);
    expect(effectiveShippedPackages(3_000_000n, 0n, nakladnaya)).toBe(120n);
    expect(tripSaleUsesPackageAccounting(0n, nakladnaya)).toBe(true);
  });

  it("без накладной и без ящиков в отгрузке — учёт ящиков не нужен", () => {
    expect(tripSaleUsesPackageAccounting(0n, null)).toBe(false);
    expect(effectiveShippedPackages(5_000n, 0n, null)).toBe(0n);
  });

  it("ящики в отгрузке имеют приоритет над накладной", () => {
    const nakladnaya = { linePackageCount: 100n, purchasedGrams: 1_000_000n };
    expect(effectiveShippedPackages(500_000n, 60n, nakladnaya)).toBe(60n);
    expect(tripSaleUsesPackageAccounting(60n, nakladnaya)).toBe(true);
  });
});
