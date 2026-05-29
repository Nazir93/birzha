import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  tripBatchShipments,
} from "../../db/schema.js";
import { isPgUniqueViolation } from "../../infrastructure/persistence/warehouse-code.js";
import {
  LoadingManifestNotEmptyError,
  LoadingManifestNotFoundError,
  LoadingManifestNumberConflictError,
} from "../errors.js";
import {
  loadingManifestDeletable,
} from "./loading-manifest-deletable.js";

export type UpdateLoadingManifestHeaderInput = {
  manifestNumber?: string;
  docDate?: string;
};

export class UpdateLoadingManifestHeaderUseCase {
  constructor(private readonly db: DbClient) {}

  async execute(manifestId: string, input: UpdateLoadingManifestHeaderInput): Promise<void> {
    const id = manifestId.trim();
    const rows = await this.db
      .select({
        manifestId: loadingManifests.id,
        tripId: loadingManifests.tripId,
        batchId: loadingManifestLines.batchId,
        onWarehouseGrams: batches.onWarehouseGrams,
        inTransitGrams: batches.inTransitGrams,
      })
      .from(loadingManifests)
      .innerJoin(loadingManifestLines, eq(loadingManifestLines.manifestId, loadingManifests.id))
      .innerJoin(batches, eq(loadingManifestLines.batchId, batches.id))
      .where(eq(loadingManifests.id, id));

    if (rows.length === 0) {
      throw new LoadingManifestNotFoundError(id);
    }

    const tripId = rows[0]!.tripId?.trim() ?? "";
    const batchIds = [...new Set(rows.map((r) => r.batchId))];
    let shipmentGramsOnLinkedTrip = 0n;
    if (tripId.length > 0 && batchIds.length > 0) {
      const sh = await this.db
        .select({
          total: sql<bigint>`coalesce(sum(${tripBatchShipments.grams}), 0::bigint)`,
        })
        .from(tripBatchShipments)
        .where(and(eq(tripBatchShipments.tripId, tripId), inArray(tripBatchShipments.batchId, batchIds)));
      shipmentGramsOnLinkedTrip = sh[0]?.total ?? 0n;
    }

    const check = loadingManifestDeletable({
      lineMasses: rows.map((r) => ({
        onWarehouseGrams: r.onWarehouseGrams,
        inTransitGrams: r.inTransitGrams,
      })),
      shipmentGramsOnLinkedTrip,
    });
    if (!check.deletable) {
      throw new LoadingManifestNotEmptyError(
        id,
        "товар уже отгружен в рейс — номер и дату изменить нельзя",
      );
    }

    const set: { manifestNumber?: string; docDate?: Date } = {};
    if (input.manifestNumber !== undefined) {
      set.manifestNumber = input.manifestNumber;
    }
    if (input.docDate !== undefined) {
      set.docDate = parseIsoDateOnly(input.docDate);
    }
    if (Object.keys(set).length === 0) {
      return;
    }

    try {
      await this.db.update(loadingManifests).set(set).where(eq(loadingManifests.id, id));
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw new LoadingManifestNumberConflictError(input.manifestNumber ?? "");
      }
      throw error;
    }
  }
}

function parseIsoDateOnly(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}
