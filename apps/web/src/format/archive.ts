import type { TripJson } from "../api/types.js";

export const TRIP_STATUS_ARCHIVED = "closed" as const;

export function isTripArchived(t: { status: string }): boolean {
  return t.status === TRIP_STATUS_ARCHIVED;
}

/** Рейсы «в работе» — только открытые. */
export function filterTripsInWork<T extends { status: string }>(trips: readonly T[]): T[] {
  return trips.filter((t) => !isTripArchived(t));
}

export function closedTripIdSet(trips: readonly TripJson[]): Set<string> {
  const s = new Set<string>();
  for (const t of trips) {
    if (isTripArchived(t)) {
      s.add(t.id);
    }
  }
  return s;
}
