import type { Trip } from "@birzha/domain";

export function tripToJson(trip: Trip) {
  const departedAt = trip.getDepartedAt();
  return {
    id: trip.getId(),
    tripNumber: trip.getTripNumber(),
    status: trip.getStatus(),
    vehicleLabel: trip.getVehicleLabel(),
    driverName: trip.getDriverName(),
    departedAt: departedAt ? departedAt.toISOString() : null,
    assignedSellerUserId: trip.getAssignedSellerUserId(),
  };
}
