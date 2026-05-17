import type { BatchListItem } from "../api/types.js";
import { formatNakladLineLabel } from "./batch-label.js";

/** Заголовок плитки калибра в кабинете продавца — без технических id. */
export function sellerCaliberTileHeadline(b: BatchListItem | undefined): string {
  const line = b ? formatNakladLineLabel(b) : "—";
  if (line !== "—") {
    return line;
  }
  const doc = b?.nakladnaya?.documentNumber?.trim();
  if (doc) {
    return `№ ${doc}`;
  }
  return "Калибр";
}

/** Подпись при нескольких партиях с одним калибром — номер накладной, не id. */
export function sellerCaliberTileSubline(b: BatchListItem | undefined): string | null {
  const doc = b?.nakladnaya?.documentNumber?.trim();
  return doc ? `накл. № ${doc}` : "ещё одна партия";
}
