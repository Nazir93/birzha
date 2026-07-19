/**
 * Совпадение города рейса и погрузочной накладной.
 * Если у рейса город не задан (legacy) — считаем совместимым.
 */
export function tripDestinationMatchesManifest(
  tripDestinationCode: string | null | undefined,
  manifestDestinationCode: string | null | undefined,
): boolean {
  const trip = tripDestinationCode?.trim() ?? "";
  if (!trip) {
    return true;
  }
  return trip === (manifestDestinationCode?.trim() ?? "");
}
