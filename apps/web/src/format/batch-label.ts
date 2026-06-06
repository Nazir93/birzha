import type { BatchListItem } from "../api/types.js";

/** Подпись калибра в `<select>`: без «№5 — Калибр №5» и «HC+ — HC+». */
export function productGradeOptionLabel(code: string, displayName: string): string {
  const c = code.trim();
  const d = displayName.trim();
  if (!c && !d) {
    return "—";
  }
  if (!d || c === d) {
    return c || d;
  }
  if (!c) {
    return d;
  }
  const norm = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
  if (norm(c) === norm(d)) {
    return c;
  }
  if (d === `Калибр ${c}` || norm(d) === `калибр ${c}`) {
    return c;
  }
  return `${c} — ${d}`;
}

/**
 * Ключ суммирования продаж в отчётах: только калибр, без номера накладной и партии.
 * Две партии «№5» из разных закупок дают одну строку.
 */
export function salesCaliberAggregateKey(batch: BatchListItem | undefined, batchId = ""): string {
  const code = batch?.nakladnaya?.productGradeCode?.trim();
  if (code) {
    return code.toLowerCase();
  }
  const group = batch?.nakladnaya?.productGroup?.trim();
  if (group) {
    return `group:${group.toLowerCase()}`;
  }
  return batchId ? `id:${batchId}` : "unknown";
}

/** Подпись калибра в сводках продаж. */
export function salesCaliberLineLabel(batch: BatchListItem | undefined, aggregateKey: string): string {
  if (batch) {
    const full = formatNakladLineLabel(batch);
    if (full !== "—") {
      return full;
    }
  }
  if (aggregateKey.startsWith("group:")) {
    return aggregateKey.slice(6);
  }
  if (aggregateKey.startsWith("id:") || aggregateKey === "unknown") {
    return batch ? "Товар · калибр не указан" : "Партия без данных накладной";
  }
  return aggregateKey;
}

/** Товар и калибр по данным накладной в списке партий. */
export function formatNakladLineLabel(b: BatchListItem): string {
  const n = b.nakladnaya;
  const g = n?.productGroup?.trim();
  const c = n?.productGradeCode?.trim();
  if (g && c) {
    return `${g} · ${c}`;
  }
  if (c) {
    return c;
  }
  return "—";
}

/**
 * Человекочитаемая строка для отчётов: номер накладной + товар/калибр;
 * если нет данных накладной — нейтральная подпись без UUID.
 */
export function formatBatchPartyCaption(b: BatchListItem | undefined, _batchId?: string): string {
  if (!b) {
    return "партия без накладной";
  }
  const doc = b.nakladnaya?.documentNumber?.trim();
  const line = formatNakladLineLabel(b);
  if (doc && line !== "—") {
    return `№ ${doc} · ${line}`;
  }
  if (line !== "—") {
    return line;
  }
  return "партия без накладной";
}
