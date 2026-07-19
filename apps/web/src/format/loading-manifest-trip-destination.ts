import type { TripJson } from "../api/types.js";

/** Рейс с городом фиксирует город погрузочной при создании — менять нельзя. */
export function tripLocksManifestDestination(
  trip: Pick<TripJson, "destinationCode"> | null | undefined,
): boolean {
  return Boolean(trip?.destinationCode?.trim());
}
