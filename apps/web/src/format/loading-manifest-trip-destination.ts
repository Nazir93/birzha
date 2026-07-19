import type { TripJson } from "../api/types.js";

/**
 * Совпадение города рейса и ПН (как в `@birzha/domain` tripDestinationMatchesManifest).
 * Рейс без города — совместим с любым.
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

/** Рейс с городом фиксирует город погрузочной — менять нельзя. */
export function tripLocksManifestDestination(
  trip: Pick<TripJson, "destinationCode"> | null | undefined,
): boolean {
  return Boolean(trip?.destinationCode?.trim());
}

/** Рейсы, совместимые с городом ПН (для «Смена рейса»). */
export function filterTripsMatchingManifestDestination<T extends Pick<TripJson, "destinationCode">>(
  trips: readonly T[],
  manifestDestinationCode: string | null | undefined,
): T[] {
  const dest = manifestDestinationCode?.trim() ?? "";
  if (!dest) {
    return [...trips];
  }
  return trips.filter((t) => tripDestinationMatchesManifest(t.destinationCode, dest));
}
