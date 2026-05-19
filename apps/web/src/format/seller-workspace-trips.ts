import type { TripJson } from "../api/types.js";

/** Как в API (`tripToJson` / домен рейса). */
export const TRIP_STATUS_CLOSED = "closed" as const;

/** Рейс закрыт в админке — только в «Архив», не в продажах и отчётах продавца. */
export function isTripOpenForSellerWorkspace(t: { status: string }): boolean {
  return t.status !== TRIP_STATUS_CLOSED;
}

/** Закреплён за продавцом (как `tripVisibleToFieldSeller` в API). */
export function isTripAssignedToSeller(t: TripJson, sellerUserId: string): boolean {
  return t.assignedSellerUserId === sellerUserId;
}

/** Все закреплённые рейсы продавца (для архива и подсчёта закрытых). */
export function filterTripsAssignedToSellerForReports(
  trips: readonly TripJson[],
  sellerUserId: string,
): TripJson[] {
  return trips.filter((t) => isTripAssignedToSeller(t, sellerUserId));
}
