import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { batches, loadingManifestLines, loadingManifests, tripBatchShipments, trips } from "../../db/schema.js";
import { LoadingManifestNotEmptyError, LoadingManifestNotFoundError } from "../errors.js";
import { loadingManifestDeletable, loadingManifestNotDeletableMessage } from "./loading-manifest-deletable.js";

export type DeleteLoadingManifestOptions = {
  /** Удаление из архива: документ и строки без отмены отгрузки в рейс. */
  fromArchive?: boolean;
};

export class DeleteLoadingManifestUseCase {
  constructor(private readonly db: DbClient) {}

  async execute(manifestId: string, options?: DeleteLoadingManifestOptions): Promise<void> {
    const id = manifestId.trim();

    const [manifestRow] = await this.db
      .select({ id: loadingManifests.id, tripId: loadingManifests.tripId })
      .from(loadingManifests)
      .where(eq(loadingManifests.id, id))
      .limit(1);

    if (!manifestRow) {
      throw new LoadingManifestNotFoundError(id);
    }

    if (options?.fromArchive) {
      const tripId = manifestRow.tripId?.trim() ?? "";
      if (tripId.length > 0) {
        const [tripRow] = await this.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, tripId))
          .limit(1);
        if (!tripRow || tripRow.status !== "closed") {
          throw new LoadingManifestNotEmptyError(
            id,
            "Удаление из архива доступно только для погрузочных закрытого рейса.",
          );
        }
      }
      await this.db.delete(loadingManifests).where(eq(loadingManifests.id, id));
      return;
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
      throw new LoadingManifestNotEmptyError(id, loadingManifestNotDeletableMessage(check.reason));
    }

    await this.db.delete(loadingManifests).where(eq(loadingManifests.id, id));
  }
}
