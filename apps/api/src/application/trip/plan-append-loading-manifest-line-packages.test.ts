import { describe, expect, it } from "vitest";

import { planAppendLoadingManifestLinePackages } from "./plan-append-loading-manifest-line-packages.js";

describe("planAppendLoadingManifestLinePackages", () => {
  it("insert: берёт ящики с UI, а не пропорцию от закупки", () => {
    expect(
      planAppendLoadingManifestLinePackages({
        kind: "insert",
        existingLinePackageCount: null,
        requestedAddPackageCount: 100n,
        totalBatchGrams: 8_500_000n,
        targetLineGrams: 1_000_000n,
        purchaseLinePackageCount: 1000n,
      }),
    ).toBe(100n);
  });

  it("increase: прибавляет указанные ящики к строке", () => {
    expect(
      planAppendLoadingManifestLinePackages({
        kind: "increase",
        existingLinePackageCount: 50n,
        requestedAddPackageCount: 100n,
        totalBatchGrams: 8_500_000n,
        targetLineGrams: 1_500_000n,
        purchaseLinePackageCount: 1000n,
      }),
    ).toBe(150n);
  });

  it("без UI — пропорция от закупки (как раньше)", () => {
    // 1000/8500 * 1000 ≈ 118
    expect(
      planAppendLoadingManifestLinePackages({
        kind: "insert",
        existingLinePackageCount: null,
        totalBatchGrams: 8_500_000n,
        targetLineGrams: 1_000_000n,
        purchaseLinePackageCount: 1000n,
      }),
    ).toBe(118n);
  });
});
