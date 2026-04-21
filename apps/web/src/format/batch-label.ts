import type { BatchListItem } from "../api/types.js";

/** Короткая подпись UUID для таблиц. */
export function formatShortBatchId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
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
 * если нет данных накладной — короткий id.
 */
export function formatBatchPartyCaption(b: BatchListItem | undefined, batchId: string): string {
  if (!b) {
    return formatShortBatchId(batchId);
  }
  const doc = b.nakladnaya?.documentNumber?.trim();
  const line = formatNakladLineLabel(b);
  if (doc && line !== "—") {
    return `№ ${doc} · ${line}`;
  }
  if (line !== "—") {
    return line;
  }
  return formatShortBatchId(batchId);
}
