import type { BatchListItem } from "../api/types.js";

/** Партия учитывается только «по накладной» — склад и id документа (в т.ч. из `purchaseId` партии). */
export function isFromPurchaseNakladnaya(b: BatchListItem): boolean {
  const n = b.nakladnaya;
  if (!n) {
    return false;
  }
  const warehouseId = String(n.warehouseId ?? "").trim();
  const documentId = String(n.documentId ?? "").trim() || String(b.purchaseId ?? "").trim();
  return Boolean(warehouseId && documentId);
}
