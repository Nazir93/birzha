import type { Trip } from "@birzha/domain";

/** Доп. поля для `GET /trips` (полный список): остаток «в пути» по отчёту. */
export type TripListJsonExtra = {
  transitRemainingGrams: string;
  hasShipmentToTrip: boolean;
  shippedGrams: string;
  soldGrams: string;
};

export function tripToJson(trip: Trip, listExtra?: TripListJsonExtra | null) {
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
