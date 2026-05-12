import { describe, expect, it } from "vitest";

import { birzhaPersistDehydrateOptions, shouldPersistBirzhaQuery } from "./birzha-query-persist.js";

function mockQuery(queryKey: unknown[], status: "success" | "error" = "success") {
  return {
    queryKey,
    state: { status },
  } as Parameters<typeof shouldPersistBirzhaQuery>[0];
}

describe("shouldPersistBirzhaQuery", () => {
  it("разрешает trips и shipment-report", () => {
    expect(shouldPersistBirzhaQuery(mockQuery(["trips"]))).toBe(true);
    expect(shouldPersistBirzhaQuery(mockQuery(["shipment-report", "id-1"]))).toBe(true);
  });

  it("разрешает counterparties и batches", () => {
    expect(shouldPersistBirzhaQuery(mockQuery(["counterparties"]))).toBe(true);
    expect(shouldPersistBirzhaQuery(mockQuery(["batches", "by-ids", "a|b"]))).toBe(true);
  });

  it("не разрешает прочие ключи", () => {
    expect(shouldPersistBirzhaQuery(mockQuery(["warehouses"]))).toBe(false);
    expect(shouldPersistBirzhaQuery(mockQuery(["outbox", "x"]))).toBe(false);
  });

  it("dehydrate: не сохраняет неуспешные запросы", () => {
    const fn = birzhaPersistDehydrateOptions.shouldDehydrateQuery;
    expect(fn).toBeDefined();
    expect(fn!(mockQuery(["trips"], "error"))).toBe(false);
    expect(fn!(mockQuery(["trips"], "success"))).toBe(true);
  });
});
