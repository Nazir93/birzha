import { describe, expect, it } from "vitest";

import { updateBatchAllocationBodySchema } from "./batch-allocation.js";

describe("updateBatchAllocationBodySchema", () => {
  it("принимает частичное тело", () => {
    expect(() => updateBatchAllocationBodySchema.parse({ qualityTier: "weak" })).not.toThrow();
  });

  it("отклоняет пустой объект", () => {
    expect(() => updateBatchAllocationBodySchema.parse({})).toThrow();
  });

  it("принимает оба null (сброс)", () => {
    const r = updateBatchAllocationBodySchema.parse({ qualityTier: null, destination: null });
    expect(r.qualityTier).toBeNull();
    expect(r.destination).toBeNull();
  });
});
