import { describe, expect, it } from "vitest";

import { availableGramsForLoadingManifestLine } from "./loading-manifest-available-grams.js";

describe("availableGramsForLoadingManifestLine", () => {
  it("вычитает резерв других ПН", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 10_000n,
        reservedOnOtherManifestsGrams: 3_000n,
      }),
    ).toBe(7_000n);
  });

  it("возврат из отбора (blocks_loading) уменьшает доступность", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 10_000n,
        reservedOnOtherManifestsGrams: 0n,
        blockingReturnGrams: 4_000n,
      }),
    ).toBe(6_000n);
  });

  it("не уходит в минус", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_000n,
        reservedOnOtherManifestsGrams: 1_500n,
        blockingReturnGrams: 0n,
      }),
    ).toBe(0n);
  });

  it("возврат с рейса без blocks_loading не обнуляет доступность", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_220_000n,
        reservedOnOtherManifestsGrams: 0n,
        blockingReturnGrams: 0n,
        qualityRejectReturnedGrams: 1_220_000n,
      }),
    ).toBe(1_220_000n);
  });
});
