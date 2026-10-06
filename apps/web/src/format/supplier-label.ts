/**
 * Порядковый № закупки по тепличнику (01, 02, …) — как номер рейса по городу:
 * у каждого тепличника свой счётчик.
 */

export function formatSupplierPurchaseNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  const v = Math.trunc(n);
  return v < 10 ? `0${v}` : String(v);
}

/** Подпись для списка/расчёта: «01 · Мурад» или номер накладной как есть (старый формат). */
export function formatSupplierPurchaseLabel(
  documentNumber: string | null | undefined,
  supplierName: string | null | undefined,
): string {
  const name = (supplierName ?? "").trim();
  const doc = (documentNumber ?? "").trim();
  const m = /^(\d+)/.exec(doc);
  if (!m) {
    return doc || name || "—";
  }
  const num = formatSupplierPurchaseNumber(Number.parseInt(m[1]!, 10));
  if (!num) {
    return doc || name || "—";
  }
  return name ? `${num} · ${name}` : num;
}

/**
 * Следующий порядковый номер накладной для выбранного тепличника
 * (аналог `suggestNextTripNumber` по городу).
 */
export function suggestNextSupplierPurchaseNumber(
  docs: readonly {
    documentNumber: string;
    supplierId?: string | null;
    supplierName?: string | null;
  }[],
  supplierId?: string | null,
  supplierName?: string | null,
): string {
  const sid = supplierId?.trim() || "";
  const name = (supplierName ?? "").trim().toLowerCase();
  if (!sid && !name) {
    return "";
  }
  const scoped = docs.filter((d) => {
    if (sid) {
      return (d.supplierId?.trim() || "") === sid;
    }
    return (d.supplierName?.trim().toLowerCase() || "") === name;
  });
  let maxNum = 0;
  for (const d of scoped) {
    const m = /^(\d+)/.exec(d.documentNumber.trim());
    if (!m) {
      continue;
    }
    const n = Number.parseInt(m[1]!, 10);
    if (Number.isFinite(n) && n > maxNum) {
      maxNum = n;
    }
  }
  /** Старые накладные без цифры в номере тоже считаем «разами». */
  const max = Math.max(maxNum, scoped.length);
  return formatSupplierPurchaseNumber(max + 1);
}
