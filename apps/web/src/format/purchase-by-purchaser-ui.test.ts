import { describe, expect, it } from "vitest";

import { showPurchaseByPurchaserWarehouseTotals } from "./purchase-by-purchaser-ui.js";

describe("showPurchaseByPurchaserWarehouseTotals", () => {
  it("у закупщика скрывает дубль «Итого по складам»", () => {
    expect(showPurchaseByPurchaserWarehouseTotals(true)).toBe(false);
  });

  it("у admin/manager показывает «Итого по складам»", () => {
    expect(showPurchaseByPurchaserWarehouseTotals(false)).toBe(true);
  });
});
