import type { ShipDestinationJson } from "../api/types.js";

/**
 * Коды из старого справочника «куда везти» на складе (качество/канал), не города для рейса.
 * В select «Город» рейса и погрузки не показываем, даже если кто-то вернул их активными.
 */
export const SHIP_DESTINATION_CODES_NOT_TRIP_CITIES = new Set(["discount", "writeoff"]);

export function isShipDestinationTripCity(code: string): boolean {
  return !SHIP_DESTINATION_CODES_NOT_TRIP_CITIES.has(code.trim());
}

/** Города для select рейса и погрузки: активные и не «уценка/списание». */
export function activeShipDestinationsForSelect(
  list: readonly ShipDestinationJson[],
): ShipDestinationJson[] {
  return list
    .filter((d) => d.isActive && isShipDestinationTripCity(d.code))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code, "ru"));
}

/** Подпись города по коду (в т.ч. снятые — для уже созданных рейсов). */
export function shipDestinationLabelByCode(
  list: readonly ShipDestinationJson[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const d of list) {
    map.set(d.code, d.displayName || d.code);
  }
  return map;
}
