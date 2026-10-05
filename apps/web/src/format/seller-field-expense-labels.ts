export const SELLER_FIELD_EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  loader: "Грузчик",
  lunch: "Обед",
  pallets: "Палеты",
  rent: "Аренда / бронь",
  materials: "Материал",
  other: "Прочее",
};

export function sellerFieldExpenseCategoryLabel(category: string): string {
  return SELLER_FIELD_EXPENSE_CATEGORY_LABEL[category] ?? category;
}
