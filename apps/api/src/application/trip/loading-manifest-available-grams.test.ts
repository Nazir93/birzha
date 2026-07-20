import { describe, expect, it } from "vitest";

import { availableGramsForLoadingManifestLine } from "./loading-manifest-available-grams.js";

describe("availableGramsForLoadingManifestLine", () => {
  it("вычитает резерв других ПН и журнал возвратов", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 10_000n,
        reservedOnOtherManifestsGrams: 3_000n,
        qualityRejectReturnedGrams: 2_000n,
      }),
    ).toBe(5_000n);
  });

  it("не уходит в минус", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_000n,
        reservedOnOtherManifestsGrams: 1_500n,
        qualityRejectReturnedGrams: 0n,
      }),
    ).toBe(0n);
  });

  it("полный возврат обнуляет доступность без резерва ПН", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_220_000n,
        reservedOnOtherManifestsGrams: 0n,
        qualityRejectReturnedGrams: 1_220_000n,
      }),
    ).toBe(0n);
  });
});
