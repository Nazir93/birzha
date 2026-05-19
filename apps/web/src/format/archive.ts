import type { TripJson } from "../api/types.js";

import { purchaseDocumentFullySold } from "./purchase-nakladnaya-list-status.js";
import { sortTripsByDepartedDesc } from "./trip-sort.js";

export const TRIP_STATUS_ARCHIVED = "closed" as const;

export function isTripArchived(t: { status: string }): boolean {
  return t.status === TRIP_STATUS_ARCHIVED;
}

/** Рейсы «в работе» — только открытые. */
export function filterTripsInWork<T extends { status: string }>(trips: readonly T[]): T[] {
  return trips.filter((t) => !isTripArchived(t));
}

/** Закрытые рейсы для архива, свежие по дате выезда. */
export function filterTripsArchived<T extends { status: string; departedAt: string | null; tripNumber: string }>(
  trips: readonly T[],
): T[] {
  return sortTripsByDepartedDesc(trips.filter(isTripArchived));
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

/** Погрузочная в архиве, если привязана к закрытому рейсу. Без рейса — остаётся в «Погрузке». */
export function isLoadingManifestArchived(
  m: { tripId: string | null | undefined },
  closedTripIds: ReadonlySet<string>,
): boolean {
  const tid = m.tripId?.trim();
  return Boolean(tid && closedTripIds.has(tid));
}

export function splitLoadingManifestsByArchive<
  T extends { tripId: string | null | undefined; docDate: string; manifestNumber: string },
>(
  manifests: readonly T[],
  closedTripIds: ReadonlySet<string>,
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const m of manifests) {
    if (isLoadingManifestArchived(m, closedTripIds)) {
      archived.push(m);
    } else {
      active.push(m);
    }
  }
  return {
    active,
    archived: sortLoadingManifestsByDocDateDesc(archived),
  };
}

export function sortLoadingManifestsByDocDateDesc<T extends { docDate: string; manifestNumber: string }>(
  manifests: readonly T[],
): T[] {
  return manifests.slice().sort((a, b) => {
    const da = a.docDate ? Date.parse(a.docDate) : 0;
    const db = b.docDate ? Date.parse(b.docDate) : 0;
    if (db !== da) {
      return db - da;
    }
    return b.manifestNumber.localeCompare(a.manifestNumber, "ru");
  });
}

export function sortPurchaseDocumentsByDocDateDesc<T extends { docDate: string; documentNumber: string }>(
  docs: readonly T[],
): T[] {
  return docs.slice().sort((a, b) => {
    const da = a.docDate ? Date.parse(a.docDate) : 0;
    const db = b.docDate ? Date.parse(b.docDate) : 0;
    if (db !== da) {
      return db - da;
    }
    return b.documentNumber.localeCompare(a.documentNumber, "ru");
  });
}

/** Накладные без остатка по партиям — только в архиве. */
export function filterPurchaseDocumentsArchived<T extends { id: string; docDate: string; documentNumber: string }>(
  docs: readonly T[],
  allBatches: Parameters<typeof purchaseDocumentFullySold>[1],
): T[] {
  return sortPurchaseDocumentsByDocDateDesc(
    docs.filter((d) => purchaseDocumentFullySold(d.id, allBatches)),
  ) as T[];
}

export function filterPurchaseDocumentsInWork<T extends { id: string; docDate: string; documentNumber: string }>(
  docs: readonly T[],
  allBatches: Parameters<typeof purchaseDocumentFullySold>[1],
): T[] {
  return sortPurchaseDocumentsByDocDateDesc(
    docs.filter((d) => !purchaseDocumentFullySold(d.id, allBatches)),
  ) as T[];
}
