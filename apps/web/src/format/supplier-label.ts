/** Порядковый № тепличника (01, 02, …) — как номер рейса. */
export function formatSupplierNumber(sortOrder: number | null | undefined): string {
  if (sortOrder == null || !Number.isFinite(sortOrder) || sortOrder <= 0) {
    return "";
  }
  const n = Math.trunc(sortOrder);
  return n < 10 ? `0${n}` : String(n);
}

/** Подпись: «01 · Дадай пр» или просто имя, если номера нет. */
export function formatSupplierLabel(
  name: string | null | undefined,
  sortOrder?: number | null,
): string {
  const label = (name ?? "").trim() || "—";
  const num = formatSupplierNumber(sortOrder);
  return num ? `${num} · ${label}` : label;
}
