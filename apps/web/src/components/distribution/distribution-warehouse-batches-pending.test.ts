import { describe, expect, it } from "vitest";

import { distributionWarehouseBatchesPending } from "./distribution-warehouse-batches-pending.js";

describe("distributionWarehouseBatchesPending", () => {
  it("ждёт справочник складов", () => {
    expect(distributionWarehouseBatchesPending({ warehousesLoaded: false, queries: [] })).toBe(true);
  });

  it("не показывает кэш, пока запрос этого захода не завершился", () => {
    expect(
      distributionWarehouseBatchesPending({
        warehousesLoaded: true,
        queries: [{ isPending: false, isFetchedAfterMount: false }],
      }),
    ).toBe(true);
  });

  it("после свежего ответа список можно показывать", () => {
    expect(
      distributionWarehouseBatchesPending({
        warehousesLoaded: true,
        queries: [{ isPending: false, isFetchedAfterMount: true }],
      }),
    ).toBe(false);
  });
});
