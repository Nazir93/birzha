import { Trip, type TripStatus } from "@birzha/domain";
import { and, asc, eq, ilike, sql } from "drizzle-orm";

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

  private tripListWhere(filter?: Omit<TripListFilter, "limit" | "offset">) {
    const parts = [];
    if (filter?.search?.trim()) {
      parts.push(ilike(trips.tripNumber, `%${filter.search.trim()}%`));
    }
    if (filter?.status) {
      parts.push(eq(trips.status, filter.status));
    }
    if (parts.length === 0) {
      return undefined;
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return and(...parts);
  }

  async count(filter?: Omit<TripListFilter, "limit" | "offset">): Promise<number> {
    const where = this.tripListWhere(filter);
    const base = this.db.select({ count: sql<number>`count(*)::int` }).from(trips);
    const row = where ? await base.where(where) : await base;
    return row[0]?.count ?? 0;
  }

  async list(filter?: TripListFilter): Promise<Trip[]> {
    const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);
    const offset = Math.max(filter?.offset ?? 0, 0);

    let base = this.db.select().from(trips);
    const where = this.tripListWhere(filter);
    if (where) {
      base = base.where(where) as typeof base;
    }

    const ordered =
      filter?.order === "tripNumberAsc"
        ? base.orderBy(asc(trips.tripNumber))
        : base.orderBy(sql`${trips.departedAt} DESC NULLS LAST`, asc(trips.tripNumber));

    const rows = await ordered.limit(limit).offset(offset);
    return rows.map(rowToTrip);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(trips).where(eq(trips.id, id));
  }
}
