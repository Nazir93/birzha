import type { TripJson } from "../api/types.js";

/** Разделение рейсов для списков: «в работе» (open) и архив (closed). */
export function splitTripsByStatus(trips: readonly TripJson[]): { open: TripJson[]; closed: TripJson[] } {
  const open: TripJson[] = [];
  const closed: TripJson[] = [];
  for (const t of trips) {
    if (t.status === "closed") {
      closed.push(t);
    } else {
      open.push(t);
    }
  }
  return { open, closed };
}

/** Список рейсов: сначала свежие по дате выезда, затем по номеру. */
export function sortTripsByDepartedDesc<T extends { departedAt: string | null; tripNumber: string }>(
  trips: readonly T[],
): T[] {
  return trips.slice().sort((a, b) => {
    const da = a.departedAt ? Date.parse(a.departedAt) : 0;
    const db = b.departedAt ? Date.parse(b.departedAt) : 0;
    if (db !== da) {
      return db - da;
    }
    return b.tripNumber.localeCompare(a.tripNumber, "ru");
  });
}

/** Сортировка по номеру рейса для селектов и сводок (по возрастанию, locale `ru`). */
export function sortTripsByTripNumberAsc<T extends { tripNumber: string }>(trips: readonly T[]): T[] {
  return trips.slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru"));
}

/** Числовое сравнение фрагментов номера — как в таблице справочника рейсов в админке. */
export function sortTripsByTripNumberNumericAsc<T extends { tripNumber: string }>(trips: readonly T[]): T[] {
  return trips.slice().sort((a, b) => a.tripNumber.localeCompare(b.tripNumber, "ru", { numeric: true }));
}
