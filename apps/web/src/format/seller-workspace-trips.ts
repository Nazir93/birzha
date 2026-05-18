import type { TripJson } from "../api/types.js";

/** Как в API (`tripToJson` / домен рейса). */
export const TRIP_STATUS_CLOSED = "closed" as const;

/** Рейс закрыт в админке — в «рабочем» кабинете продавца не показываем (остаётся в отчётах). */
export function isTripOpenForSellerWorkspace(t: { status: string }): boolean {
  return t.status !== TRIP_STATUS_CLOSED;
}

/** Закреплён за продавцом (как `tripVisibleToFieldSeller` в API). */
export function isTripAssignedToSeller(t: TripJson, sellerUserId: string): boolean {
  return t.assignedSellerUserId === sellerUserId;
}

/**
 * Рейсы для «Отчёт по рейсу»: все закреплённые (открытые и закрытые / проданные).
 * В форме продажи закрытые не выбираются — итоги смотрят здесь.
 */
export function filterTripsAssignedToSellerForReports(
  trips: readonly TripJson[],
  sellerUserId: string,
): TripJson[] {
  return trips.filter((t) => isTripAssignedToSeller(t, sellerUserId));
}
