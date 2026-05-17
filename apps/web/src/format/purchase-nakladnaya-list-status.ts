import type { BatchListItem } from "../api/types.js";

import { isFromPurchaseNakladnaya } from "./is-from-purchase-nakladnaya.js";

/** Порог кг: ниже считаем нулевым остатком (погрешность float). */
const STOCK_EPS_KG = 1e-6;

/** Есть масса на складе, в пути или ещё не принята на склад. */
export function batchHasRemainingStockKg(b: BatchListItem): boolean {
  return (
    b.pendingInboundKg > STOCK_EPS_KG ||
    b.onWarehouseKg > STOCK_EPS_KG ||
    b.inTransitKg > STOCK_EPS_KG
  );
}

/** Все партии накладной без остатка — документ уходит в «Продано». Без партий — в активных. */
export function purchaseDocumentFullySold(
  documentId: string,
  allBatches: readonly BatchListItem[],
): boolean {
  const docBatches = allBatches.filter(
    (b) => isFromPurchaseNakladnaya(b) && b.nakladnaya!.documentId === documentId,
  );
  if (docBatches.length === 0) {
    return false;
  }
  return docBatches.every((b) => !batchHasRemainingStockKg(b));
}

export function splitPurchaseDocumentsBySoldStatus<T extends { id: string }>(
  docs: readonly T[],
  allBatches: readonly BatchListItem[],
): { active: T[]; sold: T[] } {
  const active: T[] = [];
  const sold: T[] = [];
  for (const d of docs) {
    if (purchaseDocumentFullySold(d.id, allBatches)) {
      sold.push(d);
    } else {
      active.push(d);
    }
  }
  return { active, sold };
}
