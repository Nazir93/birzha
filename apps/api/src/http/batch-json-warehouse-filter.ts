import type { BatchJson } from "./batch-serialize.js";

/** Фильтр списка партий для пользователя с ограничением по складу накладной. */
export function filterBatchJsonByWarehouseScope(rows: BatchJson[], scope: Set<string>): BatchJson[] {
  return rows.filter((r) => {
    const w = r.nakladnaya?.warehouseId?.trim();
    if (!w) {
      return false;
    }
    return scope.has(w);
  });
}
