import { Batch } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import {
  assertBatchSoldMatchesJournal,
  assertGoldenTripBatchReconcile,
  batchSoldGrams,
} from "./batch-journal-reconcile.js";

describe("batch-journal-reconcile", () => {
  it("assertBatchSoldMatchesJournal проходит при совпадении", () => {
    const batch = Batch.create({
      id: "b1",
      purchaseId: "p1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    batch.shipToTrip(50, "t1");
    batch.sellFromTrip(30, "s1");
    expect(() => assertBatchSoldMatchesJournal(batch, 30_000n)).not.toThrow();
    expect(batchSoldGrams(batch)).toBe(30_000n);
  });

  it("assertBatchSoldMatchesJournal падает при расхождении", () => {
    const batch = Batch.create({
      id: "b2",
      purchaseId: "p1",
      totalKg: 100,
      pricePerKg: 1,
      distribution: "on_hand",
    });
    batch.shipToTrip(50, "t1");
    batch.sellFromTrip(30, "s1");
    expect(() => assertBatchSoldMatchesJournal(batch, 25_000n)).toThrow(/Расхождение sold/);
  });

  it("assertGoldenTripBatchReconcile для типичного рейса", () => {
    const batch = Batch.create({
      id: "b3",
      purchaseId: "p1",
      totalKg: 5000,
      pricePerKg: 40,
      distribution: "on_hand",
    });
    batch.shipToTrip(3000, "t1");
    batch.writeOffFromTransit(100, "shortage");
    batch.sellFromTrip(2900, "s1");
    expect(() =>
      assertGoldenTripBatchReconcile({
        batch,
        reportSoldGrams: 2_900_000n,
        reportShippedGrams: 3_000_000n,
        reportShortageGrams: 100_000n,
      }),
    ).not.toThrow();
  });
});
