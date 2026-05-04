/** Дата закупочной накладной (`docDate` с API, обычно YYYY-MM-DD) для подписей на экране. */
export function formatPurchaseDocDateRu(docDate: string): string {
  const trimmed = docDate.trim();
  if (!trimmed) {
    return "—";
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T12:00:00`) : new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return trimmed;
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
