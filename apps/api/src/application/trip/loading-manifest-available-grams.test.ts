import { describe, expect, it } from "vitest";

import {
  availableGramsForLoadingManifestLine,
  shouldReleaseLoadingBlocksForManifest,
} from "./loading-manifest-available-grams.js";

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

  it("без блокировки весь свободный склад доступен в строку ПН", () => {
    expect(
      availableGramsForLoadingManifestLine({
        onWarehouseGrams: 1_220_000n,
        reservedOnOtherManifestsGrams: 0n,
        blockingReturnGrams: 0n,
      }),
    ).toBe(1_220_000n);
  });
});

describe("shouldReleaseLoadingBlocksForManifest", () => {
  it("снимает блокировку если всё закрыто журналом, а склад не пуст", () => {
    expect(
      shouldReleaseLoadingBlocksForManifest([{ physicalFreeGrams: 10_000n, availableGrams: 0n }]),
    ).toBe(true);
  });

  it("не снимает если есть доступные кг", () => {
    expect(
      shouldReleaseLoadingBlocksForManifest([
        { physicalFreeGrams: 10_000n, availableGrams: 6_000n },
        { physicalFreeGrams: 5_000n, availableGrams: 0n },
      ]),
    ).toBe(false);
  });
});
