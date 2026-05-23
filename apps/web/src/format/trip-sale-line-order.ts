import type { TripSaleLineJson } from "../api/types.js";

/** Сначала последняя зафиксированная продажа (для списка «Исправить»). */
export function sortTripSaleLinesNewestFirst(lines: TripSaleLineJson[]): TripSaleLineJson[] {
  return [...lines].sort((a, b) => {
    const ta = Date.parse(a.recordedAt);
    const tb = Date.parse(b.recordedAt);
    const aTime = Number.isFinite(ta) ? ta : 0;
    const bTime = Number.isFinite(tb) ? tb : 0;
    if (bTime !== aTime) {
      return bTime - aTime;
    }
    return b.id.localeCompare(a.id, "ru");
  });
}
