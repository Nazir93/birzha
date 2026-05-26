import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import { batchWarehouseId, isEligibleForLoadingAllocation } from "./batch-warehouse.js";

function b(p: Partial<BatchListItem> & { id: string }): BatchListItem {
  return {
    purchaseId: "p",
    totalKg: 0,
    pricePerKg: 0,
    pendingInboundKg: 0,
    onWarehouseKg: 100,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...p,
  };
}

describe("batchWarehouseId", () => {
  it("берёт warehouseId из накладной", () => {
    expect(
      batchWarehouseId(
        b({
          id: "1",
          nakladnaya: {
            warehouseId: "wh-1",
            documentId: null,
            documentNumber: null,
            productGradeCode: null,
            productGroup: null,
          },
        }),
      ),
    ).toBe("wh-1");
  });
});

describe("isEligibleForLoadingAllocation", () => {
  it("true при указанном складе без documentId", () => {
    expect(
      isEligibleForLoadingAllocation(
        b({
          id: "1",
          purchaseId: "",
          nakladnaya: {
            warehouseId: "wh-1",
            documentId: null,
            documentNumber: null,
            productGradeCode: null,
            productGroup: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it("false без склада", () => {
    expect(isEligibleForLoadingAllocation(b({ id: "1" }))).toBe(false);
  });
});
