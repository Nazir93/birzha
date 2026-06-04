import type { LoadingManifestLineMassGrams } from "./loading-manifest-trip-assign-lock.js";

/** Удаление ПН запрещено: по привязанному рейсу уже есть строки отгрузки этой накладной. */
export type LoadingManifestNotDeletableReason = "shipped_to_trip";

export function loadingManifestDeletable(input: {
  lineMasses: readonly LoadingManifestLineMassGrams[];
  shipmentGramsOnLinkedTrip: bigint;
}): { deletable: true } | { deletable: false; reason: LoadingManifestNotDeletableReason } {
  if (input.shipmentGramsOnLinkedTrip > 0n) {
    return { deletable: false, reason: "shipped_to_trip" };
  }
  return { deletable: true };
}

export function loadingManifestNotDeletableMessage(reason: LoadingManifestNotDeletableReason): string {
  switch (reason) {
    case "shipped_to_trip":
      return "Нельзя удалить: по этой погрузочной уже есть отгрузка в привязанный рейс. Сначала отмените отгрузку в «Операциях».";
    default:
      return "Погрузочную накладную нельзя удалить.";
  }
}
