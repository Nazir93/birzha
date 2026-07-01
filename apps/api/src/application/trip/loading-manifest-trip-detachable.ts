export type LoadingManifestTripDetachLockCode =
  | "not_linked"
  | "trip_closed"
  | "sales_or_shortage"
  | "shipment_mismatch";

export type LoadingManifestTripDetachBatchInput = {
  manifestGrams: bigint;
  shipmentGramsOnTrip: bigint;
  inTransitGrams: bigint;
  soldGramsOnTrip: bigint;
  shortageGramsOnTrip: bigint;
};

/** Когда ПН можно отвязать от рейса (UI + POST detach-trip). */
export function loadingManifestTripDetachable(input: {
  tripId: string | null;
  tripStatus: "open" | "closed" | null;
  batches: readonly LoadingManifestTripDetachBatchInput[];
}): { detachable: true } | { detachable: false; code: LoadingManifestTripDetachLockCode } {
  const tripId = input.tripId?.trim() ?? "";
  if (tripId.length === 0) {
    return { detachable: false, code: "not_linked" };
  }
  if (input.tripStatus === "closed") {
    return { detachable: false, code: "trip_closed" };
  }

  for (const batch of input.batches) {
    if (batch.soldGramsOnTrip > 0n || batch.shortageGramsOnTrip > 0n) {
      return { detachable: false, code: "sales_or_shortage" };
    }
    if (batch.manifestGrams <= 0n) {
      continue;
    }
    if (batch.shipmentGramsOnTrip === 0n) {
      continue;
    }
    const reverseGrams =
      batch.manifestGrams < batch.shipmentGramsOnTrip
        ? batch.manifestGrams
        : batch.shipmentGramsOnTrip;
    if (reverseGrams < batch.manifestGrams) {
      return { detachable: false, code: "shipment_mismatch" };
    }
    if (reverseGrams > batch.inTransitGrams) {
      return { detachable: false, code: "shipment_mismatch" };
    }
  }

  return { detachable: true };
}

export function loadingManifestTripDetachLockMessage(code: LoadingManifestTripDetachLockCode): string {
  switch (code) {
    case "not_linked":
      return "Погрузочная накладная не привязана к рейсу.";
    case "trip_closed":
      return "Рейс закрыт — отвязать погрузочную накладную нельзя.";
    case "sales_or_shortage":
      return "По рейсу уже есть продажи или недостачи по партиям этой накладной — отвязка недоступна.";
    case "shipment_mismatch":
      return "Масса по накладной не совпадает с отгрузкой в рейс — отвязка недоступна. Обратитесь к администратору.";
    default:
      return "Отвязка от рейса недоступна.";
  }
}
