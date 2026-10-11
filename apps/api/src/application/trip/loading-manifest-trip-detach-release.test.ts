import { describe, expect, it } from "vitest";

import { isBatchFullyReservedOnDraftManifests } from "../../infrastructure/persistence/drizzle-loading-manifest-reserved-grams.js";

/**
 * Контракт открепления: после unship документ ПН удаляется.
 * Если оставить строки при tripId = null — партии снова «полностью в резерве».
 */
describe("detach trip releases warehouse reservation", () => {
  it("строки черновой ПН на весь остаток блокируют новый отбор", () => {
    expect(
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: 2_296_000n,
        reservedOnDraftManifestsGrams: 2_296_000n,
      }),
    ).toBe(true);
  });

  it("без строк черновой ПН остаток снова доступен для погрузки", () => {
    expect(
      isBatchFullyReservedOnDraftManifests({
        onWarehouseGrams: 2_296_000n,
        reservedOnDraftManifestsGrams: 0n,
      }),
    ).toBe(false);
  });
});
