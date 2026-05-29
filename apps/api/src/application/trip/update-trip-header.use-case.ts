import { TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

export type UpdateTripHeaderInput = {
  tripNumber?: string;
  vehicleLabel?: string | null;
  driverName?: string | null;
  departedAt?: string | null;
};

export class UpdateTripHeaderUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(tripId: string, input: UpdateTripHeaderInput): Promise<void> {
    const trip = await this.trips.findById(tripId.trim());
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    trip.updateHeader({
      tripNumber: input.tripNumber,
      vehicleLabel: input.vehicleLabel,
      driverName: input.driverName,
      departedAt:
        input.departedAt === undefined
          ? undefined
          : input.departedAt == null
            ? null
            : new Date(input.departedAt),
    });
    await this.trips.save(trip);
  }
}
