const STORAGE_KEY = "birzha.ops.preferredWarehouseId";

/** Запоминаемый склад для кабинета /o (накладная, распределение). */
export function readPreferredWarehouseId(): string | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw == null || raw.trim() === "") {
      return null;
    }
    return raw.trim();
  } catch {
    return null;
  }
}

export function writePreferredWarehouseId(warehouseId: string | null): void {
  try {
    if (warehouseId == null || warehouseId.trim() === "") {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, warehouseId.trim());
  } catch {
    /* ignore quota / private mode */
  }
}
