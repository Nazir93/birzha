import type { Trip } from "@birzha/domain";

/** Доп. поля для `GET /trips` (полный список): остаток «в пути» по отчёту. */
export type TripListJsonExtra = {
  transitRemainingGrams: string;
  hasShipmentToTrip: boolean;
  shippedGrams: string;
  soldGrams: string;
};

/** Опциональные подписи из справочников (JOIN при сериализации HTTP). */
export type TripJsonNameExtras = {
  /** Человекочитаемое направление (`ship_destinations.display_name`). */
  destinationName?: string | null;
};

export function tripToJson(
  trip: Trip,
  listExtra?: TripListJsonExtra | null,
  nameExtras?: TripJsonNameExtras | null,
) {
  const departedAt = trip.getDepartedAt();
  const base = {
    id: trip.getId(),
    tripNumber: trip.getTripNumber(),
    status: trip.getStatus(),
    vehicleLabel: trip.getVehicleLabel(),
    driverName: trip.getDriverName(),
    departedAt: departedAt ? departedAt.toISOString() : null,
    assignedSellerUserId: trip.getAssignedSellerUserId(),
    destinationCode: trip.getDestinationCode(),
    destinationName: nameExtras?.destinationName ?? null,
    productGroup: trip.getProductGroup(),
  };
  if (!listExtra) {
    return base;
  }
  return {
    ...base,
    transitRemainingGrams: listExtra.transitRemainingGrams,
    hasShipmentToTrip: listExtra.hasShipmentToTrip,
    shippedGrams: listExtra.shippedGrams,
    soldGrams: listExtra.soldGrams,
  };
}
