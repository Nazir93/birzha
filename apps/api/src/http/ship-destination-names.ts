import { inArray } from "drizzle-orm";

import type { DbClient } from "../db/client.js";
import { shipDestinations } from "../db/schema.js";

/** Подписи городов по кодам (`ship_destinations.display_name`). */
export async function shipDestinationDisplayNamesByCodes(
  db: DbClient | null,
  codes: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      codes
        .map((c) => c?.trim() ?? "")
        .filter((c) => c.length > 0),
    ),
  ];
  if (!db || unique.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      code: shipDestinations.code,
      displayName: shipDestinations.displayName,
    })
    .from(shipDestinations)
    .where(inArray(shipDestinations.code, unique));
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.code, (r.displayName?.trim() || r.code));
  }
  return map;
}

export function destinationNameFromMap(
  map: Map<string, string>,
  destinationCode: string | null | undefined,
): string | null {
  const code = destinationCode?.trim() ?? "";
  if (!code) {
    return null;
  }
  return map.get(code) ?? code;
}
