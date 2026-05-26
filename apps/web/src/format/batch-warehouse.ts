import type { BatchListItem } from "../api/types.js";

/** Склад партии для отбора в погрузку (из блока накладной в ответе API). */
export function batchWarehouseId(b: BatchListItem): string {
  return String(b.nakladnaya?.warehouseId ?? "").trim();
}

/** Партия с остатком на складе и указанным складом — доступна в «Погрузке на машину». */
export function isEligibleForLoadingAllocation(b: BatchListItem): boolean {
  return batchWarehouseId(b) !== "";
}
