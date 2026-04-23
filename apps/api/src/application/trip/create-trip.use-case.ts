import { Trip } from "@birzha/domain";

import type { TripRepository } from "../ports/trip-repository.port.js";

export type CreateTripInput = {
  id: string;
  tripNumber: string;
  vehicleLabel?: string | null;
  driverName?: string | null;
  /** ISO-строка или null (дата валидируется в `createTripBodySchema`). */
  departedAt?: string | null;
}

export class CreateTripUseCase {
  constructor(private readonly trips: TripRepository) {}

  async execute(input: CreateTripInput): Promise<void> {
    const iso = input.departedAt;
    await this.trips.save(
      Trip.create({
        id: input.id,
        tripNumber: input.tripNumber,
        vehicleLabel: input.vehicleLabel,
        driverName: input.driverName,
        departedAt: iso == null || iso.trim() === "" ? null : new Date(iso),
      }),
    );
  }
}
