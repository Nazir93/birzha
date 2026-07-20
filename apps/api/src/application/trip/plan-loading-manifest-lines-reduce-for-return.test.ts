import { describe, expect, it } from "vitest";

import { planLoadingManifestLinesReduceForReturn } from "./plan-loading-manifest-lines-reduce-for-return.js";

describe("planLoadingManifestLinesReduceForReturn", () => {
  it("уменьшает одну строку на всю массу возврата", () => {
    const plan = planLoadingManifestLinesReduceForReturn({
      returnGrams: 40_000n,
      lines: [
        {
          manifestId: "m1",
          batchId: "b1",
          lineNo: 1,
          grams: 100_000n,
          packageCount: 10n,
          tripId: null,
          shipmentGramsOnTrip: 0n,
        },
      ],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]?.reduceGrams).toBe(40_000n);
    expect(plan[0]?.newGrams).toBe(60_000n);
    expect(plan[0]?.newPackageCount).toBe(6n);
    expect(plan[0]?.unshipGrams).toBe(0n);
  });

  it("удаляет строку (newGrams=0), если возврат покрывает её полностью", () => {
    const plan = planLoadingManifestLinesReduceForReturn({
      returnGrams: 1220_000n,
      lines: [
        {
          manifestId: "m1",
          batchId: "b1",
          lineNo: 1,
          grams: 1220_000n,
          packageCount: 160n,
          tripId: null,
          shipmentGramsOnTrip: 0n,
        },
      ],
    });
    expect(plan[0]?.newGrams).toBe(0n);
    expect(plan[0]?.newPackageCount).toBeNull();
  });

  it("распределяет возврат по нескольким ПН и планирует unship", () => {
    const plan = planLoadingManifestLinesReduceForReturn({
      returnGrams: 80_000n,
      lines: [
        {
          manifestId: "m1",
          batchId: "b1",
          lineNo: 1,
          grams: 50_000n,
          packageCount: 5n,
          tripId: "t1",
          shipmentGramsOnTrip: 50_000n,
        },
        {
          manifestId: "m2",
          batchId: "b1",
          lineNo: 1,
          grams: 50_000n,
          packageCount: 5n,
          tripId: null,
          shipmentGramsOnTrip: 0n,
        },
      ],
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]?.reduceGrams).toBe(50_000n);
    expect(plan[0]?.unshipGrams).toBe(50_000n);
    expect(plan[1]?.reduceGrams).toBe(30_000n);
    expect(plan[1]?.newGrams).toBe(20_000n);
    expect(plan[1]?.unshipGrams).toBe(0n);
  });
});
