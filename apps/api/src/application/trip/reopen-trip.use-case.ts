import { TripNotFoundError } from "../errors.js";
import type { TripRepository } from "../ports/trip-repository.port.js";

export class ReopenTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(tripId: string): Promise<void> {
    const trip = await this.trips.findById(tripId);
    if (!trip) {
      throw new TripNotFoundError(tripId);
    }
    trip.reopen();
    await this.trips.save(trip);
  }
}
