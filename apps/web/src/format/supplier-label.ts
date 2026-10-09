/**
 * Порядковый № закупки по тепличнику (01, 02, …) — как номер рейса по городу:
 * у каждого тепличника свой счётчик.
 */

import { formatPurchaseDocDateRu } from "./purchase-doc-date.js";

export function formatSupplierPurchaseNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  const v = Math.trunc(n);
  return v < 10 ? `0${v}` : String(v);
}

/**
 * Подпись: «01 · Мурад · 06.10.2026» (новый формат) или номер накладной как есть (старый).
 * Дата — опционально; для старых «Имя · дата» в `documentNumber` дата уже внутри.
 */
export function formatSupplierPurchaseLabel(
  documentNumber: string | null | undefined,
  supplierName: string | null | undefined,
  docDate?: string | null,
): string {
  const name = (supplierName ?? "").trim();
  const doc = (documentNumber ?? "").trim();
  const dateRu = docDate?.trim() ? formatPurchaseDocDateRu(docDate.trim()) : "";
  const datePart = dateRu && dateRu !== "—" ? dateRu : "";
  const m = /^(\d+)/.exec(doc);
  if (!m) {
    // Произвольный номер (НФ-… и т.п.): не теряем тепличника в подписи карточки.
    if (doc && name && !doc.toLowerCase().includes(name.toLowerCase())) {
      return datePart ? `${doc} · ${name} · ${datePart}` : `${doc} · ${name}`;
    }
    return doc || name || "—";
  }
  const num = formatSupplierPurchaseNumber(Number.parseInt(m[1]!, 10));
  if (!num) {
    if (doc && name && !doc.toLowerCase().includes(name.toLowerCase())) {
      return datePart ? `${doc} · ${name} · ${datePart}` : `${doc} · ${name}`;
    }
    return doc || name || "—";
  }
  const parts = [num];
  if (name) {
    parts.push(name);
  }
  if (datePart) {
    parts.push(datePart);
  }
  return parts.join(" · ");
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
