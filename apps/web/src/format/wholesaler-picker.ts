export const WHOLESALER_SELLER_MAX_ROWS = 80;

export type WholesalerListItem = { id: string; name: string; isActive: boolean };

/** Список оптовиков для продавца: сразу все активные, поиск без минимума символов. */
export function filterWholesalersForSellerPicker(
  active: WholesalerListItem[],
  search: string,
  selectedId: string,
): { rows: WholesalerListItem[]; truncated: boolean; totalMatched: number } {
  const q = search.trim().toLowerCase();
  const matched = q ? active.filter((w) => w.name.toLowerCase().includes(q)) : active;
  const totalMatched = matched.length;
  let rows = totalMatched > WHOLESALER_SELLER_MAX_ROWS ? matched.slice(0, WHOLESALER_SELLER_MAX_ROWS) : matched;
  const sel = selectedId ? active.find((w) => w.id === selectedId) : undefined;
  if (sel && !rows.some((r) => r.id === sel.id)) {
    rows = [sel, ...rows];
  }
  return { rows, truncated: totalMatched > WHOLESALER_SELLER_MAX_ROWS, totalMatched };
}

/**
 * Имя для «Добавить оптовика» из строки поиска: непустое и без точного совпадения (без учёта регистра).
 */
export function wholesalerCreateNameFromSearch(
  search: string,
  active: Pick<WholesalerListItem, "name">[],
): string | null {
  const name = search.trim();
  if (!name) {
    return null;
  }
  const lower = name.toLocaleLowerCase("ru-RU");
  if (active.some((w) => w.name.trim().toLocaleLowerCase("ru-RU") === lower)) {
    return null;
  }
  return name;
}
