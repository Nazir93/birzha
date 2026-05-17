import type { BatchListItem } from "../api/types.js";

/** Запасная подпись партии без данных накладной (UUID в UI не показываем). */
export function formatShortBatchId(_id: string): string {
  return "партия без накладной";
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
