import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";

import {
  aggregateWarehouseDocumentsFromBatches,
  estimateBatchWarehousePackages,
} from "./warehouse-purchase-documents-aggregate.js";

function batch(partial: Partial<BatchListItem> & Pick<BatchListItem, "id">): BatchListItem {
  return {
    purchaseId: "p1",
    totalKg: 100,
    pricePerKg: 10,
    pendingInboundKg: 0,
    onWarehouseKg: 50,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...partial,
  };
}

describe("estimateBatchWarehousePackages", () => {
  it("считает ящики пропорционально остатку на складе", () => {
    expect(
      estimateBatchWarehousePackages(
        batch({
          id: "b1",
          onWarehouseKg: 50,
          nakladnaya: {
            documentId: "d1",
            warehouseId: "wh-1",
            productGradeCode: "N5",
            productGroup: "Помидоры",
            documentNumber: "НФ-1",
            linePackageCount: 20,
          },
        }),
      ),
    ).toBe(10);
  });
});

describe("aggregateWarehouseDocumentsFromBatches", () => {
  it("группирует партии по накладной", () => {
    const rows = aggregateWarehouseDocumentsFromBatches([
      batch({
        id: "b1",
        onWarehouseKg: 100,
        nakladnaya: {
          documentId: "doc-a",
          warehouseId: "wh-manas",
          productGradeCode: "N5",
          productGroup: "Помидоры",
          documentNumber: "НФ-100",
          linePackageCount: 10,
        },
      }),
      batch({
        id: "b2",
        onWarehouseKg: 40,
        inTransitKg: 10,
        nakladnaya: {
          documentId: "doc-a",
          warehouseId: "wh-manas",
          productGradeCode: "N4",
          productGroup: "Помидоры",
          documentNumber: "НФ-100",
          linePackageCount: 8,
        },
      }),
      batch({
        id: "b3",
        onWarehouseKg: 30,
        nakladnaya: {
          documentId: "doc-b",
          warehouseId: "wh-manas",
          productGradeCode: "N3",
          productGroup: "Огурцы",
          documentNumber: "НФ-200",
          linePackageCount: 6,
        },
      }),
    ]);

    expect(rows).toHaveLength(2);
    const docA = rows.find((r) => r.documentId === "doc-a");
    expect(docA?.documentNumber).toBe("НФ-100");
    expect(docA?.lineCount).toBe(2);
    expect(docA?.onWarehouseKg).toBe(140);
    expect(docA?.inTransitKg).toBe(10);
  });

  it("фильтрует по номеру накладной", () => {
    const rows = aggregateWarehouseDocumentsFromBatches(
      [
        batch({
          id: "b1",
          nakladnaya: {
            documentId: "doc-a",
            warehouseId: "wh-1",
            productGradeCode: "N5",
            productGroup: null,
            documentNumber: "НФ-100",
          },
        }),
        batch({
          id: "b2",
          nakladnaya: {
            documentId: "doc-b",
            warehouseId: "wh-1",
            productGradeCode: "N4",
            productGroup: null,
            documentNumber: "НФ-200",
          },
        }),
      ],
      { search: "200" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.documentNumber).toBe("НФ-200");
  });
});
