import type { BatchListItem } from "../api/types.js";

/** Уникальные виды товара на партиях (без пустых), по алфавиту. */
export function productGroupsPresentOnBatches(batches: readonly BatchListItem[]): string[] {
  const set = new Set<string>();
  for (const b of batches) {
    const g = b.nakladnaya?.productGroup?.trim();
    if (g) {
      set.add(g);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export function productGroupSelectOptions(
  groups: readonly string[],
): Array<{ value: string; label: string }> {
  return [
    { value: "", label: "— все товары —" },
    ...groups.map((g) => ({ value: g, label: g })),
  ];
}

/**
 * Фильтр отбора/догрузки по виду товара.
 * Пустой фильтр — все партии; партия без товара (старые данные) проходит любой фильтр.
 */
export function batchMatchesProductGroupFilter(
  batch: BatchListItem,
  productGroup: string | null | undefined,
): boolean {
  const want = productGroup?.trim() ?? "";
  if (!want) {
    return true;
  }
  const group = batch.nakladnaya?.productGroup?.trim() ?? "";
  return !group || group === want;
}
