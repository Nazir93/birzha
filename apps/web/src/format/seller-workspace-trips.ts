/** Как в API (`tripToJson` / домен рейса). */
export const TRIP_STATUS_CLOSED = "closed" as const;

/** Рейс закрыт в админке — в «рабочем» кабинете продавца не показываем (остаётся в отчётах). */
export function isTripOpenForSellerWorkspace(t: { status: string }): boolean {
  return t.status !== TRIP_STATUS_CLOSED;
}
