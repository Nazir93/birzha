import { describe, expect, it } from "vitest";

import { NAV_PANEL_LABELS } from "../auth/role-panels.js";
import { ops, adminRoutes } from "../routes.js";

describe("warehouse returns navigation", () => {
  it("подпись раздела в меню", () => {
    expect(NAV_PANEL_LABELS.warehouseReturns).toBe("Возврат на склад");
  });

  it("маршруты /o и /a", () => {
    expect(ops.warehouseReturns).toBe("/o/warehouse-returns");
    expect(adminRoutes.warehouseReturns).toBe("/a/warehouse-returns");
  });
});
