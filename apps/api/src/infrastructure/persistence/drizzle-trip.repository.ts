import { Trip, type TripStatus } from "@birzha/domain";
import { asc, eq } from "drizzle-orm";

import type { TripRepository } from "../../application/ports/trip-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { trips } from "../../db/schema.js";

function parseStatus(raw: string): TripStatus {
  if (raw === "open" || raw === "closed") {
    return raw;
  }
  throw new Error(`Неизвестный статус рейса в БД: ${raw}`);
}

export class DrizzleTripRepository implements TripRepository {
  constructor(private readonly db: DbClient) {}

  async save(trip: Trip): Promise<void> {
    const row = {
      id: trip.getId(),
      tripNumber: trip.getTripNumber(),
      status: trip.getStatus(),
      vehicleLabel: trip.getVehicleLabel(),
      driverName: trip.getDriverName(),
      departedAt: trip.getDepartedAt(),
    };

    const existing = await this.db
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.id, row.id))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(trips).values(row);
      return;
    }

    await this.db.update(trips).set(row).where(eq(trips.id, row.id));
  }

  async findById(id: string): Promise<Trip | null> {
    const rows = await this.db.select().from(trips).where(eq(trips.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return Trip.restore({
      id: row.id,
      tripNumber: row.tripNumber,
      status: parseStatus(row.status),
      vehicleLabel: row.vehicleLabel,
      driverName: row.driverName,
      departedAt: row.departedAt,
    });
  }

  async list(): Promise<Trip[]> {
    const rows = await this.db.select().from(trips).orderBy(asc(trips.tripNumber));
    return rows.map((row) =>
      Trip.restore({
        id: row.id,
        tripNumber: row.tripNumber,
        status: parseStatus(row.status),
        vehicleLabel: row.vehicleLabel,
        driverName: row.driverName,
        departedAt: row.departedAt,
      }),
    );
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(trips).where(eq(trips.id, id));
  }
}
