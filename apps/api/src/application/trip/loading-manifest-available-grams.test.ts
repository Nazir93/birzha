import { describe, expect, it } from "vitest";

import { availableGramsForLoadingManifestLine } from "./loading-manifest-available-grams.js";

describe("availableGramsForLoadingManifestLine", () => {
  it("вычитает возврат и резерв других ПН", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 10_000n,
        qualityRejectReturnGrams: 2_000n,
        reservedOnOtherManifestsGrams: 3_000n,
      }),
    ).toBe(5_000n);
  });

  it("не уходит в минус", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_000n,
        qualityRejectReturnGrams: 800n,
        reservedOnOtherManifestsGrams: 500n,
      }),
    ).toBe(0n);
  });
});
