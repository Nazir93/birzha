import { describe, expect, it, vi } from "vitest";

import { apiGetJson } from "../api/fetch-api.js";
import { selectionReturnsQueryOptions, warehouseWriteOffsLedgerQueryOptions } from "./core-list-queries.js";

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
    expect(opt.queryKey).toEqual(["warehouse-write-offs-ledger", "wh-1", 150, 0]);

    await opt.queryFn!();

    expect(spy).toHaveBeenCalledWith("/api/warehouse-write-offs?limit=150&offset=0&warehouseId=wh-1");
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
    expect(opt.queryKey).toEqual(["warehouse-write-offs-ledger", "", 300, 0]);

    await opt.queryFn!();

    expect(spy).toHaveBeenCalledWith("/api/warehouse-write-offs?limit=300&offset=0");
  });
});

describe("selectionReturnsQueryOptions", () => {
  it("только возвраты из отбора по складу; ключ под корнем журнала (сбрасывается вместе с ним)", async () => {
    const spy = vi.mocked(apiGetJson);
    spy.mockResolvedValueOnce({ ledger: "recent", warehouseIdFilter: "wh-1", limit: 500, totalKg: 0, lines: [] });

    const opt = selectionReturnsQueryOptions("wh-1");
    expect(opt.queryKey).toEqual(["warehouse-write-offs-ledger", "selection", "wh-1"]);

    await opt.queryFn!();

    expect(spy).toHaveBeenCalledWith(
      "/api/warehouse-write-offs?limit=500&offset=0&warehouseId=wh-1&blocksLoading=1",
    );
  });

  it("без склада — запрос выключен", () => {
    expect(selectionReturnsQueryOptions("").enabled).toBe(false);
  });
});
