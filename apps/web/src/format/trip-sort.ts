/** Сортировка по номеру рейса для селектов и сводок (по возрастанию, locale `ru`). */
export function sortTripsByTripNumberAsc<T extends { tripNumber: string }>(trips: readonly T[]): T[] {
  return trips.slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
}

/** Числовое сравнение фрагментов номера — как в таблице справочника рейсов в админке. */
export function sortTripsByTripNumberNumericAsc<T extends { tripNumber: string }>(trips: readonly T[]): T[] {
  return trips.slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru", { numeric: true }));
}
