import {
  conflictingBatchProduct,
  effectiveTripProductGroup,
  tripProductMismatchMessage,
} from "@birzha/contracts";
import { eq, inArray } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import { productGrades, purchaseDocumentLines, trips } from "../../db/schema.js";
import { TripNotFoundError, TripProductMismatchError } from "../errors.js";

async function productGroupsForBatches(
  db: DbClient,
  batchIds: readonly string[],
): Promise<(string | null)[]> {
  const ids = [...new Set(batchIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const rows = await db
    .select({ productGroup: productGrades.productGroup })
    .from(purchaseDocumentLines)
    .leftJoin(productGrades, eq(purchaseDocumentLines.productGradeId, productGrades.id))
    .where(inArray(purchaseDocumentLines.batchId, ids));
  return rows.map((row) => row.productGroup);
}

/** Нельзя отгрузить помидоры на рейс огурцов и наоборот. */
export async function assertBatchesMatchTripProduct(
  db: DbClient,
  input: { tripId: string; batchIds: readonly string[] },
): Promise<void> {
  const tripId = input.tripId.trim();
  if (!tripId) {
    return;
  }
  const [trip] = await db
    .select({ productGroup: trips.productGroup })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) {
    throw new TripNotFoundError(tripId);
  }
  const batchProducts = await productGroupsForBatches(db, input.batchIds);
  const batchProduct = conflictingBatchProduct(trip.productGroup, batchProducts);
  if (!batchProduct) {
    return;
  }
  const tripProduct = effectiveTripProductGroup(trip.productGroup);
  throw new TripProductMismatchError(
    tripId,
    tripProduct,
    batchProduct,
    tripProductMismatchMessage(tripProduct, batchProduct),
  );
}
