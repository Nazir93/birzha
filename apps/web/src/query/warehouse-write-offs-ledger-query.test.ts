import { describe, expect, it, vi } from "vitest";

import { apiGetJson } from "../api/fetch-api.js";
import { warehouseWriteOffsLedgerQueryOptions } from "./core-list-queries.js";

vi.mock("../api/fetch-api.js", () => ({
  apiGetJson: vi.fn(),
}));

describe("warehouseWriteOffsLedgerQueryOptions", () => {
  it("queryKey включает склад и лимит; queryFn дергает GET с limit и warehouseId", async () => {
    const spy = vi.mocked(apiGetJson);
    spy.mockResolvedValueOnce({
      ledger: "recent",
      warehouseIdFilter: "wh-1",
      limit: 150,
      totalKg: 0,
      lines: [],
    });

    const opt = warehouseWriteOffsLedgerQueryOptions({ warehouseId: "wh-1", limit: 150 });
    expect(opt.queryKey).toEqual(["warehouse-write-offs-ledger", "wh-1", 150]);

    await opt.queryFn!();

    expect(spy).toHaveBeenCalledWith("/api/warehouse-write-offs?limit=150&warehouseId=wh-1");
  });

  it("без склада — только limit в query string", async () => {
    const spy = vi.mocked(apiGetJson);
    spy.mockResolvedValueOnce({
      ledger: "recent",
      warehouseIdFilter: null,
      limit: 300,
      totalKg: 0,
      lines: [],
    });

    const opt = warehouseWriteOffsLedgerQueryOptions({});
    expect(opt.queryKey).toEqual(["warehouse-write-offs-ledger", "", 300]);

    await opt.queryFn!();

    expect(spy).toHaveBeenCalledWith("/api/warehouse-write-offs?limit=300");
  });
});
