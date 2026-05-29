import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { batches, loadingManifestLines, loadingManifests, tripBatchShipments } from "../../db/schema.js";
import { LoadingManifestNotEmptyError, LoadingManifestNotFoundError } from "../errors.js";
import { loadingManifestDeletable, loadingManifestNotDeletableMessage } from "./loading-manifest-deletable.js";

export class DeleteLoadingManifestUseCase {
  constructor(private readonly db: DbClient) {}

  async execute(manifestId: string): Promise<void> {
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
      throw new LoadingManifestNotEmptyError(id, loadingManifestNotDeletableMessage(check.reason));
    }

    await this.db.delete(loadingManifests).where(eq(loadingManifests.id, id));
  }
}
