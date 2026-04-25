import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import { isFromPurchaseNakladnaya } from "./is-from-purchase-nakladnaya.js";

function b(p: Partial<BatchListItem> & { id: string }): BatchListItem {
  return {
    purchaseId: "p",
    totalKg: 0,
    pricePerKg: 0,
    pendingInboundKg: 0,
    onWarehouseKg: 0,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...p,
  };
}

describe("isFromPurchaseNakladnaya", () => {
  it("true при documentId и warehouseId в накл.", () => {
    expect(
      isFromPurchaseNakladnaya(
        b({
          id: "1",
          nakladnaya: {
            documentId: "d1",
            warehouseId: "w1",
            documentNumber: "1",
            productGradeCode: "x",
            productGroup: null,
          } as BatchListItem["nakladnaya"],
        }),
      ),
    ).toBe(true);
  });

  it("false без documentId", () => {
    expect(
      isFromPurchaseNakladnaya(
        b({ id: "1", nakladnaya: { warehouseId: "w" } as BatchListItem["nakladnaya"] }),
      ),
    ).toBe(false);
  });

  it("false без warehouseId", () => {
    expect(
      isFromPurchaseNakladnaya(
        b({ id: "1", nakladnaya: { documentId: "d" } as BatchListItem["nakladnaya"] }),
      ),
    ).toBe(false);
  });
});
