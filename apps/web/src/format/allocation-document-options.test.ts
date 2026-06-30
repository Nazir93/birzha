import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import { documentOptionsForAllocation } from "./allocation-document-options.js";

function batch(partial: Partial<BatchListItem> & { id: string }): BatchListItem {
  return {
    purchaseId: "p1",
    totalKg: 100,
    pricePerKg: 10,
    pendingInboundKg: 0,
    onWarehouseKg: 50,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "doc-1",
      documentNumber: "001",
      warehouseId: "wh-1",
      productGradeCode: "A",
      productGroup: null,
      linePackageCount: null,
    },
    ...partial,
  };
}

describe("documentOptionsForAllocation", () => {
  it("skips batches without documentId or zero warehouse stock", () => {
    expect(
      documentOptionsForAllocation([
        batch({ id: "b1" }),
        batch({ id: "b2", onWarehouseKg: 0 }),
        batch({ id: "b3", nakladnaya: { ...batch({ id: "x" }).nakladnaya!, documentId: null } }),
      ]),
    ).toEqual([{ id: "doc-1", number: "001", checkboxLabel: "№ 001" }]);
  });

  it("deduplicates document ids and adds grade hint for duplicate numbers", () => {
    const opts = documentOptionsForAllocation([
      batch({ id: "b1", nakladnaya: { ...batch({ id: "x" }).nakladnaya!, documentId: "d1", documentNumber: "01" } }),
      batch({
        id: "b2",
        nakladnaya: {
          ...batch({ id: "x" }).nakladnaya!,
          documentId: "d2",
          documentNumber: "01",
          productGradeCode: "B",
        },
      }),
    ]);
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => o.checkboxLabel).sort()).toEqual(["№ 01 · A", "№ 01 · B"]);
  });
});
