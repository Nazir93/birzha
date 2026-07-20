import type { ShipDestinationJson } from "../api/types.js";

/** Города для select создания/выбора рейса и погрузки: только активные. */
export function activeShipDestinationsForSelect(
  list: readonly ShipDestinationJson[],
): ShipDestinationJson[] {
  return list
    .filter((d) => d.isActive)
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
