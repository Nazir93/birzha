import { Trip, type TripStatus } from "@birzha/domain";
import { asc, eq, ilike, sql } from "drizzle-orm";

import type { TripListFilter, TripRepository } from "../../application/ports/trip-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { trips } from "../../db/schema.js";

function parseStatus(raw: string): TripStatus {
  if (raw === "open" || raw === "closed") {
    return raw;
  }
  throw new Error(`Неизвестный статус рейса в БД: ${raw}`);
}

function rowToTrip(row: typeof trips.$inferSelect): Trip {
  return Trip.restore({
    id: row.id,
    tripNumber: row.tripNumber,
    status: parseStatus(row.status),
    vehicleLabel: row.vehicleLabel,
    driverName: row.driverName,
    departedAt: row.departedAt,
    assignedSellerUserId: row.assignedSellerUserId,
  });
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
      assignedSellerUserId: trip.getAssignedSellerUserId(),
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
    return rowToTrip(row);
  }

  async list(filter?: TripListFilter): Promise<Trip[]> {
    if (!filter) {
      const rows = await this.db.select().from(trips).orderBy(asc(trips.tripNumber));
      return rows.map(rowToTrip);
    }

    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);

    const base = this.db.select().from(trips);
    const filtered = filter.search?.trim()
      ? base.where(ilike(trips.tripNumber, `%${filter.search.trim()}%`))
      : base;

    const ordered =
      filter.order === "tripNumberAsc"
        ? filtered.orderBy(asc(trips.tripNumber))
        : filtered.orderBy(sql`${trips.departedAt} DESC NULLS LAST`, asc(trips.tripNumber));

    const rows = await ordered.limit(limit).offset(offset);
    return rows.map(rowToTrip);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(trips).where(eq(trips.id, id));
  }
}
