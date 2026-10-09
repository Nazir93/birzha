import { describe, expect, it } from "vitest";

import { isBatchFullyReservedOnDraftManifests } from "./drizzle-loading-manifest-reserved-grams.js";

describe("isBatchFullyReservedOnDraftManifests", () => {
  it("полный резерв черновика — партия скрыта из нового отбора", () => {
    expect(
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: 100_000n,
        reservedOnDraftManifestsGrams: 100_000n,
      }),
    ).toBe(true);
  });

  it("после частичного возврата хвост на складе — не полностью в резерве", () => {
    expect(
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: 100_000n,
        reservedOnDraftManifestsGrams: 60_000n,
      }),
    ).toBe(false);
  });

  it("без строк черновика — не в резерве", () => {
    expect(
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: 100_000n,
        reservedOnDraftManifestsGrams: 0n,
      }),
    ).toBe(false);
  });
});
