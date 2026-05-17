export type LoadingManifestTripAssignLockCode = "already_assigned" | "already_shipped" | "no_stock";

export type LoadingManifestTripAssignLock = {
  locked: boolean;
  code?: LoadingManifestTripAssignLockCode;
};

export type LoadingManifestLineMassGrams = {
  onWarehouseGrams: bigint;
  inTransitGrams: bigint;
};

/** Когда привязка ПН к рейсу больше не должна быть доступна (UI + POST assign-trip). */
export function loadingManifestTripAssignLock(input: {
  tripId: string | null;
  lineMasses: readonly LoadingManifestLineMassGrams[];
}): LoadingManifestTripAssignLock {
  const tripId = input.tripId?.trim() ?? "";
  if (tripId.length > 0) {
    return { locked: true, code: "already_assigned" };
  }
  if (input.lineMasses.length === 0) {
    return { locked: false };
  }
  const allNoWarehouse = input.lineMasses.every((l) => l.onWarehouseGrams <= 0n);
  if (!allNoWarehouse) {
    return { locked: false };
  }
  const anyTransit = input.lineMasses.some((l) => l.inTransitGrams > 0n);
  return { locked: true, code: anyTransit ? "already_shipped" : "no_stock" };
}

export function loadingManifestTripAssignLockMessage(code: LoadingManifestTripAssignLockCode): string {
  switch (code) {
    case "already_assigned":
      return "Погрузочная накладная уже привязана к рейсу. Смена или повторная привязка недоступны.";
    case "already_shipped":
      return "Масса по партиям уже отгружена в рейс — привязка накладной недоступна.";
    case "no_stock":
      return "На складе по партиям этой накладной нет остатка — привязка недоступна.";
    default:
      return "Привязка к рейсу недоступна.";
  }
}
