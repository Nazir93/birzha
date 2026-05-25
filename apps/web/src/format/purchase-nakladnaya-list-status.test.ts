import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";

import {
  batchHasRemainingStockKg,
  countBatchesWithRemainingStock,
  sumSoldKgInWorkBatches,
  purchaseDocumentFullySold,
  splitPurchaseDocumentsBySoldStatus,
} from "./purchase-nakladnaya-list-status.js";

function batch(
  id: string,
  documentId: string,
  stock: { pending?: number; warehouse?: number; transit?: number },
): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: stock.pending ?? 0,
    onWarehouseKg: stock.warehouse ?? 0,
    inTransitKg: stock.transit ?? 0,
    soldKg: 100,
    writtenOffKg: 0,
    nakladnaya: {
      documentId,
      documentNumber: "Н-1",
      warehouseId: "w1",
      productGroup: "Томат",
      productGradeCode: "57",
    },
  };
}

describe("purchase-nakladnaya-list-status", () => {
  it("остаток на складе — партия ещё в работе", () => {
    expect(batchHasRemainingStockKg(batch("b1", "d1", { warehouse: 10 }))).toBe(true);
  });

  it("всё продано/отгружено — партия без остатка", () => {
    expect(batchHasRemainingStockKg(batch("b1", "d1", {}))).toBe(false);
  });

  it("countBatchesWithRemainingStock считает только партии с остатком", () => {
    const batches = [
      batch("b1", "d1", { warehouse: 1 }),
      batch("b2", "d1", {}),
      batch("b3", "d2", { transit: 0.5 }),
    ];
    expect(countBatchesWithRemainingStock(batches)).toBe(2);
  });

  it("sumSoldKgInWorkBatches не суммирует проданное без остатка", () => {
    const batches = [
      batch("b1", "d1", { warehouse: 5 }),
      batch("b2", "d1", {}),
    ];
    expect(sumSoldKgInWorkBatches(batches)).toBe(100);
    expect(sumSoldKgInWorkBatches([batches[1]!])).toBe(0);
  });

  it("накладная продана, когда у всех партий нет остатка", () => {
    const batches = [
      batch("b1", "d1", {}),
      batch("b2", "d1", {}),
    ];
    expect(purchaseDocumentFullySold("d1", batches)).toBe(true);
  });

  it("накладная без партий — не в «Продано»", () => {
    expect(purchaseDocumentFullySold("d1", [])).toBe(false);
  });

  it("есть остаток в рейсе — накладная активна", () => {
    const batches = [batch("b1", "d1", { transit: 5 })];
    expect(purchaseDocumentFullySold("d1", batches)).toBe(false);
  });

  it("разделяет список документов", () => {
    const docs = [
      { id: "d-active", documentNumber: "A" },
      { id: "d-sold", documentNumber: "B" },
    ];
    const batches = [batch("b1", "d-sold", {})];
    const { active, sold } = splitPurchaseDocumentsBySoldStatus(docs, batches);
    expect(active.map((d) => d.id)).toEqual(["d-active"]);
    expect(sold.map((d) => d.id)).toEqual(["d-sold"]);
  });
});
