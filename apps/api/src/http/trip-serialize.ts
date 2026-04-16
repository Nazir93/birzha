import type { Trip } from "@birzha/domain";

export function tripToJson(trip: Trip) {
  return {
    id: trip.getId(),
    tripNumber: trip.getTripNumber(),
    status: trip.getStatus(),
  };
}
