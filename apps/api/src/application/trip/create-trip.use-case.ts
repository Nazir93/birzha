import { Trip } from "@birzha/domain";

import type { TripRepository } from "../ports/trip-repository.port.js";

export type CreateTripInput = {
  id: string;
  tripNumber: string;
};

export class CreateTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(input: CreateTripInput): Promise<void> {
    await this.trips.save(Trip.create(input));
  }
}
