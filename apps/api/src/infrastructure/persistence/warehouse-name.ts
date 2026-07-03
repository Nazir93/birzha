/** Нормализация названия склада для проверки дубликатов. */
export function normalizeWarehouseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function warehouseNamesEqual(a: string, b: string): boolean {
  return normalizeWarehouseName(a) === normalizeWarehouseName(b);
}
