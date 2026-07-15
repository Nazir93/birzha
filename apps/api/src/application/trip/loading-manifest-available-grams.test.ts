import { describe, expect, it } from "vitest";

import { availableGramsForLoadingManifestLine } from "./loading-manifest-available-grams.js";

describe("availableGramsForLoadingManifestLine", () => {
  it("вычитает только резерв других ПН", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 10_000n,
        reservedOnOtherManifestsGrams: 3_000n,
      }),
    ).toBe(7_000n);
  });

  it("не уходит в минус", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_000n,
        reservedOnOtherManifestsGrams: 1_500n,
      }),
    ).toBe(0n);
  });
});
