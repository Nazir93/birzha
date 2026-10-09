import { describe, expect, it } from "vitest";

import {
  availableGramsForLoadingManifestLine,
  batchIdsToReleaseLoadingBlocks,
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

describe("batchIdsToReleaseLoadingBlocks", () => {
  it("режим новой ПН: только available=0 при наличии склада", () => {
    expect(
      batchIdsToReleaseLoadingBlocks(
        [
          { batchId: "a", physicalFreeGrams: 10_000n, availableGrams: 0n },
          { batchId: "b", physicalFreeGrams: 5_000n, availableGrams: 2_000n },
        ],
        "when_available_zero",
      ),
    ).toEqual(["a"]);
  });

  it("режим новой ПН: в смешанном отборе снимает только полностью заблокированные", () => {
    expect(
      batchIdsToReleaseLoadingBlocks(
        [
          { batchId: "free", physicalFreeGrams: 10_000n, availableGrams: 6_000n },
          { batchId: "returned", physicalFreeGrams: 5_000n, availableGrams: 0n },
        ],
        "when_available_zero",
      ),
    ).toEqual(["returned"]);
  });

  it("режим догрузки: снимает если блокировка режет свободный склад", () => {
    expect(
      batchIdsToReleaseLoadingBlocks(
        [{ batchId: "partial", physicalFreeGrams: 100_000n, availableGrams: 60_000n }],
        "when_blocking_reduces_free",
      ),
    ).toEqual(["partial"]);
  });

  it("не снимает если свободного склада нет", () => {
    expect(
      batchIdsToReleaseLoadingBlocks(
        [{ batchId: "x", physicalFreeGrams: 0n, availableGrams: 0n }],
        "when_available_zero",
      ),
    ).toEqual([]);
  });
});

describe("shouldReleaseLoadingBlocksForManifest", () => {
  it("true если есть партия с available=0 и физическим остатком", () => {
    expect(
      shouldReleaseLoadingBlocksForManifest([{ physicalFreeGrams: 10_000n, availableGrams: 0n }]),
    ).toBe(true);
    expect(
      shouldReleaseLoadingBlocksForManifest([
        { physicalFreeGrams: 10_000n, availableGrams: 6_000n },
        { physicalFreeGrams: 5_000n, availableGrams: 0n },
      ]),
    ).toBe(true);
  });

  it("false если у всех available > 0", () => {
    expect(
      shouldReleaseLoadingBlocksForManifest([
        { physicalFreeGrams: 10_000n, availableGrams: 6_000n },
        { physicalFreeGrams: 5_000n, availableGrams: 1_000n },
      ]),
    ).toBe(false);
  });
});
