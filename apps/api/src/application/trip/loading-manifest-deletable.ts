import type { LoadingManifestLineMassGrams } from "./loading-manifest-trip-assign-lock.js";

/** Удаление ПН запрещено: масса уже ушла в рейс (inTransit или строки отгрузки). */
export type LoadingManifestNotDeletableReason = "shipped_to_trip";

export function loadingManifestDeletable(input: {
  lineMasses: readonly LoadingManifestLineMassGrams[];
  shipmentGramsOnLinkedTrip: bigint;
}): { deletable: true } | { deletable: false; reason: LoadingManifestNotDeletableReason } {
  if (input.lineMasses.some((l) => l.inTransitGrams > 0n)) {
    return { deletable: false, reason: "shipped_to_trip" };
  }
  if (input.shipmentGramsOnLinkedTrip > 0n) {
    return { deletable: false, reason: "shipped_to_trip" };
  }
  return { deletable: true };
}

export function loadingManifestNotDeletableMessage(reason: LoadingManifestNotDeletableReason): string {
  switch (reason) {
    case "shipped_to_trip":
      return "Нельзя удалить: товар по накладной уже отгружен в рейс. Сначала отмените отгрузку в «Операциях».";
    default:
      return "Погрузочную накладную нельзя удалить.";
  }
}
