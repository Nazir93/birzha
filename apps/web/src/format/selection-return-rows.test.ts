import { describe, expect, it } from "vitest";

import type { WarehouseWriteOffsRecentResponse } from "../api/types.js";
import { selectionReturnRowsFromLedger } from "./selection-return-rows.js";

type LedgerLine = WarehouseWriteOffsRecentResponse["lines"][number];

function line(over: Partial<LedgerLine>): LedgerLine {
  return {
    id: "wo-1",
    batchId: "b-1",
    kg: 1275,
    createdAt: "2026-10-14T14:48:03.000Z",
    purchaseDocumentId: "doc-1",
    documentNumber: "02",
    supplierName: "Мурад 7",
    docDate: "2026-10-14",
    productGradeCode: "№7",
    warehouseName: "Манас",
    warehouseCode: "MANAS",
    packageCount: 150,
    blocksLoading: true,
    ...over,
  };
}

describe("selectionReturnRowsFromLedger", () => {
  it("подпись: тепличник · № накладной · калибр; кг и ящики из журнала", () => {
    expect(selectionReturnRowsFromLedger([line({})])).toEqual([
      { writeOffId: "wo-1", kg: 1275, packageCount: 150, label: "Мурад 7 · № 02 · №7" },
    ]);
  });

  it("без тепличника и калибра — только номер; без ничего — прочерк", () => {
    const rows = selectionReturnRowsFromLedger([
      line({ id: "a", supplierName: null, productGradeCode: null }),
      line({ id: "b", supplierName: null, productGradeCode: null, documentNumber: null, packageCount: null }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(["№ 02", "—"]);
    expect(rows[1]!.packageCount).toBeNull();
  });
});
