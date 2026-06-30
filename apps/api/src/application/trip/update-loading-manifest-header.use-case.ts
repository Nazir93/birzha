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

    const [manifestRow] = await this.db
      .select({ id: loadingManifests.id, tripId: loadingManifests.tripId })
      .from(loadingManifests)
      .where(eq(loadingManifests.id, id))
      .limit(1);

    if (!manifestRow) {
      throw new LoadingManifestNotFoundError(id);
    }

    const lineRows = await this.db
      .select({
        batchId: loadingManifestLines.batchId,
        onWarehouseGrams: batches.onWarehouseGrams,
        inTransitGrams: batches.inTransitGrams,
      })
      .from(loadingManifestLines)
      .leftJoin(batches, eq(loadingManifestLines.batchId, batches.id))
      .where(eq(loadingManifestLines.manifestId, id));

    const tripId = manifestRow.tripId?.trim() ?? "";
    const batchIds = [...new Set(lineRows.map((r) => r.batchId))];
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
      lineMasses: lineRows.map((r) => ({
        onWarehouseGrams: r.onWarehouseGrams ?? 0n,
        inTransitGrams: r.inTransitGrams ?? 0n,
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
