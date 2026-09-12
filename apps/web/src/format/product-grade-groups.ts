import type { ProductGradeJson } from "../api/types.js";

export type ProductGradeOptionGroup = {
  key: string;
  label: string;
  grades: ProductGradeJson[];
};

/** Уникальные товары (product_group) и калибры внутри каждого. */
export function groupProductGradesByProduct(
  productGrades: readonly ProductGradeJson[],
): ProductGradeOptionGroup[] {
  const list = productGrades.slice();
  list.sort((a, b) => {
    const ga = (a.productGroup ?? "").trim();
    const gb = (b.productGroup ?? "").trim();
    if (ga !== gb) {
      if (ga === "") return 1;
      if (gb === "") return -1;
      return ga.localeCompare(gb, "ru");
    }
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru");
  });
  const byKey = new Map<string, ProductGradeJson[]>();
  for (const g of list) {
    const groupKey = (g.productGroup ?? "").trim() || "";
    if (!byKey.has(groupKey)) {
      byKey.set(groupKey, []);
    }
    byKey.get(groupKey)!.push(g);
  }
  const keys = [...byKey.keys()].sort((a, b) => {
    if (a === "" && b !== "") return 1;
    if (b === "" && a !== "") return -1;
    return a.localeCompare(b, "ru");
  });
  return keys.map((k) => ({
    key: k || "__empty__",
    label: k === "" ? "Без группы товара" : k,
    grades: byKey.get(k)!,
  }));
}

export function productGroupOptionsFromGradeGroups(
  groups: readonly ProductGradeOptionGroup[],
): Array<{ value: string; label: string }> {
  return groups
    .filter((g) => g.key !== "__empty__")
    .map((g) => ({ value: g.label, label: g.label }));
}
