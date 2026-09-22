import { and, asc, eq, inArray } from "drizzle-orm";

import type {
  TripShipmentAggregate,
  TripShipmentAppend,
  TripShipmentRepository,
} from "../../application/ports/trip-shipment-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { loadingManifestLines, loadingManifests, tripBatchShipments } from "../../db/schema.js";

export class DrizzleTripShipmentRepository implements TripShipmentRepository {
  constructor(private readonly db: DbClient) {}

  async append(row: TripShipmentAppend): Promise<void> {
    await this.db.insert(tripBatchShipments).values({
      id: row.id,
      tripId: row.tripId,
      batchId: row.batchId,
      grams: row.grams,
      packageCount: row.packageCount,
    });
  }

  async totalGramsForTripAndBatch(tripId: string, batchId: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(and(eq(tripBatchShipments.tripId, tripId), eq(tripBatchShipments.batchId, batchId)));
    let sum = 0n;
    for (const r of rows) {
      sum += r.grams;
    }
    return sum;
  }

  async totalGramsForBatch(batchId: string): Promise<bigint> {
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(eq(tripBatchShipments.batchId, batchId));
    let sum = 0n;
    for (const r of rows) {
      sum += r.grams;
    }
    return sum;
  }

  async deleteByBatchIds(batchIds: string[]): Promise<void> {
    if (batchIds.length === 0) {
      return;
    }
    await this.db.delete(tripBatchShipments).where(inArray(tripBatchShipments.batchId, batchIds));
  }

  async deleteAllForTripId(tripId: string): Promise<void> {
    await this.db.delete(tripBatchShipments).where(eq(tripBatchShipments.tripId, tripId));
  }

  async reduceForTripAndBatch(
    tripId: string,
    batchId: string,
    gramsToRemove: bigint,
    packageCountToRemove: bigint | null,
  ): Promise<void> {
    if (gramsToRemove <= 0n) {
      return;
    }
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(and(eq(tripBatchShipments.tripId, tripId), eq(tripBatchShipments.batchId, batchId)))
      .orderBy(tripBatchShipments.id);

    let gramsLeft = gramsToRemove;
    let pkgLeft = packageCountToRemove ?? 0n;

    for (const row of rows) {
      if (gramsLeft <= 0n) {
        break;
      }
      if (row.grams <= gramsLeft) {
        gramsLeft -= row.grams;
        if (row.packageCount != null && row.packageCount > 0n && pkgLeft > 0n) {
          pkgLeft -= row.packageCount < pkgLeft ? row.packageCount : pkgLeft;
        }
        await this.db.delete(tripBatchShipments).where(eq(tripBatchShipments.id, row.id));
        continue;
      }
      const newGrams = row.grams - gramsLeft;
      const rowPkg = row.packageCount ?? 0n;
      let newPkg = rowPkg;
      if (pkgLeft > 0n && rowPkg > 0n) {
        const removePkg = rowPkg < pkgLeft ? rowPkg : pkgLeft;
        newPkg = rowPkg - removePkg;
        pkgLeft -= removePkg;
      }
      await this.db
        .update(tripBatchShipments)
        .set({
          grams: newGrams,
          packageCount: newPkg > 0n ? newPkg : null,
        })
        .where(eq(tripBatchShipments.id, row.id));
      gramsLeft = 0n;
    }
  }

  async aggregateByTripId(tripId: string): Promise<TripShipmentAggregate> {
    const rows = await this.db
      .select()
      .from(tripBatchShipments)
      .where(eq(tripBatchShipments.tripId, tripId));

    const byGrams = new Map<string, bigint>();
    const byPackages = new Map<string, bigint>();
    let total = 0n;
    let totalPkg = 0n;
    for (const r of rows) {
      total += r.grams;
      byGrams.set(r.batchId, (byGrams.get(r.batchId) ?? 0n) + r.grams);
      const p = r.packageCount ?? 0n;
      totalPkg += p;
      byPackages.set(r.batchId, (byPackages.get(r.batchId) ?? 0n) + p);
    }
    const batchIds = new Set([...byGrams.keys(), ...byPackages.keys()]);
    const loadOrder = await this.loadOrderByBatchId(tripId);
    const lines = [...batchIds]
      .sort((a, b) => {
        const oa = loadOrder.get(a);
        const ob = loadOrder.get(b);
        if (oa != null && ob != null && oa !== ob) {
          return oa - ob;
        }
        if (oa != null && ob == null) {
          return -1;
        }
        if (oa == null && ob != null) {
          return 1;
        }
        return a.localeCompare(b);
      })
      .map((batchId) => ({
        batchId,
        grams: byGrams.get(batchId) ?? 0n,
        packageCount: byPackages.get(batchId) ?? 0n,
      }));
    return { totalGrams: total, totalPackageCount: totalPkg, byBatch: lines };
  }

  /** Порядок погрузки: время ПН на рейсе, внутри — номер строки (как грузили тепличников). */
  private async loadOrderByBatchId(tripId: string): Promise<Map<string, number>> {
    const orderRows = await this.db
      .select({
        batchId: loadingManifestLines.batchId,
        createdAt: loadingManifests.createdAt,
        lineNo: loadingManifestLines.lineNo,
      })
      .from(loadingManifestLines)
      .innerJoin(loadingManifests, eq(loadingManifestLines.manifestId, loadingManifests.id))
      .where(eq(loadingManifests.tripId, tripId))
      .orderBy(asc(loadingManifests.createdAt), asc(loadingManifestLines.lineNo));

    const loadOrder = new Map<string, number>();
    let index = 0;
    for (const row of orderRows) {
      if (loadOrder.has(row.batchId)) {
        continue;
      }
      loadOrder.set(row.batchId, index);
      index += 1;
    }
    return loadOrder;
  }
}
