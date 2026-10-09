import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  documentOptionsForAllocation,
  formatAllocationDocumentCheckboxLabel,
  purchaseDocumentLabelFromBatches,
} from "./allocation-document-options.js";

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
      supplierName: "Теплица Юг",
    },
    allocation: { qualityTier: null, destination: "moscow" },
    ...partial,
  };
}

describe("formatAllocationDocumentCheckboxLabel", () => {
  it("тепличник · номер → направление", () => {
    expect(
      formatAllocationDocumentCheckboxLabel({
        number: "001",
        suppliers: ["Теплица Юг"],
        destinations: ["Москва"],
        gradeHint: "",
        duplicateNumber: false,
      }),
    ).toBe("Теплица Юг · № 001 → Москва");
  });

  it("дубль номера добавляет калибр", () => {
    expect(
      formatAllocationDocumentCheckboxLabel({
        number: "01",
        suppliers: [],
        destinations: [],
        gradeHint: "A, B",
        duplicateNumber: true,
      }),
    ).toBe("№ 01 · A, B");
  });
});

describe("documentOptionsForAllocation", () => {
  it("skips batches without documentId or zero warehouse stock", () => {
    expect(
      documentOptionsForAllocation(
        [
          batch({ id: "b1" }),
          batch({ id: "b2", onWarehouseKg: 0 }),
          batch({ id: "b3", nakladnaya: { ...batch({ id: "x" }).nakladnaya!, documentId: null } }),
        ],
        { moscow: "Москва" },
      ),
    ).toEqual([
      {
        id: "doc-1",
        number: "001",
        checkboxLabel: "Теплица Юг · № 001 → Москва",
      },
    ]);
  });

  it("deduplicates document ids and adds grade hint for duplicate numbers", () => {
    const opts = documentOptionsForAllocation(
      [
        batch({
          id: "b1",
          nakladnaya: {
            ...batch({ id: "x" }).nakladnaya!,
            documentId: "d1",
            documentNumber: "01",
            supplierName: "Альфа",
          },
          allocation: { qualityTier: null, destination: "moscow" },
        }),
        batch({
          id: "b2",
          nakladnaya: {
            ...batch({ id: "x" }).nakladnaya!,
            documentId: "d2",
            documentNumber: "01",
            productGradeCode: "B",
            supplierName: "Бета",
          },
          allocation: { qualityTier: null, destination: "spb" },
        }),
      ],
      { moscow: "Москва", spb: "СПб" },
    );
    expect(opts).toHaveLength(2);
    expect(opts.map((o) => o.checkboxLabel).sort()).toEqual([
      "Альфа · № 01 · A → Москва",
      "Бета · № 01 · B → СПб",
    ]);
  });

  it("без справочника направлений показывает код destination", () => {
    const opts = documentOptionsForAllocation([
      batch({
        id: "b1",
        nakladnaya: { ...batch({ id: "x" }).nakladnaya!, supplierName: null },
        allocation: { qualityTier: null, destination: "kazan" },
      }),
    ]);
    expect(opts[0]?.checkboxLabel).toBe("№ 001 → kazan");
  });
});

describe("purchaseDocumentLabelFromBatches", () => {
  it("собирает тепличника и направление из партий", () => {
    expect(
      purchaseDocumentLabelFromBatches(
        [batch({ id: "b1" }), batch({ id: "b2", nakladnaya: { ...batch({ id: "x" }).nakladnaya!, documentNumber: "001" } })],
        { documentId: "doc-1", documentNumber: "001" },
        { moscow: "Москва" },
      ),
    ).toBe("Теплица Юг · № 001 → Москва");
  });
});
