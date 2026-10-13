import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../../api/types.js";
import { aggregateBatchesByDocumentCaliberLine } from "../../format/loading-manifest.js";
import { resolveAppendCandidateLines } from "./AppendCandidatesTable.js";

function batch(p: Partial<BatchListItem> & Pick<BatchListItem, "id">): BatchListItem {
  return {
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 100,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    availableForLoadingKg: p.availableForLoadingKg ?? p.onWarehouseKg ?? 100,
    nakladnaya: {
      documentId: "d1",
      warehouseId: "w1",
      productGradeCode: "№5",
      productGroup: "Помидоры",
      documentNumber: "01",
      supplierName: "Мурад",
      docDate: "2026-10-12",
      linePackageCount: 10,
    },
    ...p,
  };
}

function rowKeyFor(batches: BatchListItem[]): string {
  const rows = aggregateBatchesByDocumentCaliberLine(batches, "loading");
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!.rowKey;
}

describe("resolveAppendCandidateLines — выборочная догрузка возврата на тот же рейс", () => {
  it("пустое поле — весь свободный остаток (весь возврат)", () => {
    const batches = [batch({ id: "b1", onWarehouseKg: 40, availableForLoadingKg: 40, totalKg: 100 })];
    expect(resolveAppendCandidateLines(batches, undefined, {}, {})).toEqual([{ batchId: "b1", kg: 40 }]);
  });

  it("указать кг — догрузить только часть возвращённого", () => {
    const batches = [batch({ id: "b1", onWarehouseKg: 40, availableForLoadingKg: 40, totalKg: 100 })];
    const key = rowKeyFor(batches);
    expect(resolveAppendCandidateLines(batches, undefined, { [key]: "15" }, {})).toEqual([
      { batchId: "b1", kg: 15 },
    ]);
  });

  it("0 — строку не брать", () => {
    const batches = [batch({ id: "b1", onWarehouseKg: 40, availableForLoadingKg: 40, totalKg: 100 })];
    const key = rowKeyFor(batches);
    expect(resolveAppendCandidateLines(batches, undefined, { [key]: "0" }, {})).toEqual([]);
  });

  it("больше остатка — ошибка (null)", () => {
    const batches = [batch({ id: "b1", onWarehouseKg: 40, availableForLoadingKg: 40, totalKg: 100 })];
    const key = rowKeyFor(batches);
    expect(resolveAppendCandidateLines(batches, undefined, { [key]: "50" }, {})).toBeNull();
  });

  it("ящики: часть возврата", () => {
    const batches = [
      batch({
        id: "b1",
        totalKg: 100,
        onWarehouseKg: 40,
        availableForLoadingKg: 40,
      }),
    ];
    const key = rowKeyFor(batches);
    expect(resolveAppendCandidateLines(batches, undefined, {}, { [key]: "1" })).toEqual([
      { batchId: "b1", kg: 10, packageCount: 1 },
    ]);
  });

  it("кг и ящики вместе — в API уходят оба", () => {
    const batches = [
      batch({
        id: "b1",
        totalKg: 8500,
        onWarehouseKg: 8500,
        availableForLoadingKg: 8500,
        nakladnaya: {
          documentId: "d1",
          warehouseId: "w1",
          productGradeCode: "№5",
          productGroup: "Помидоры",
          documentNumber: "01",
          supplierName: "Мурад",
          docDate: "2026-10-12",
          linePackageCount: 1000,
        },
      }),
    ];
    const key = rowKeyFor(batches);
    expect(resolveAppendCandidateLines(batches, undefined, { [key]: "1000" }, { [key]: "100" })).toEqual([
      { batchId: "b1", kg: 1000, packageCount: 100 },
    ]);
  });
});
