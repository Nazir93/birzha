import { and, eq, inArray, ne } from "drizzle-orm";

import type { DbClient } from "../../db/client.js";
import {
  batches,
  loadingManifestLines,
  loadingManifests,
  shipDestinations,
} from "../../db/schema.js";

function formatDocDateRu(docDate: Date): string {
  const y = docDate.getUTCFullYear();
  const m = String(docDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(docDate.getUTCDate()).padStart(2, "0");
  return `${d}.${m}.${y}`;
}

/** Базовый номер ПН при смене рейса/города (как в web resolveLoadingManifestNumberForSave). */
export function buildLoadingManifestNumberForTripDestination(input: {
  tripNumber: string;
  destinationLabel: string;
  docDate: Date;
}): string {
  const trip = input.tripNumber.trim() || "01";
  const destination = input.destinationLabel.trim() || "Направление";
  return `${trip} · ${destination} · ${formatDocDateRu(input.docDate)}`;
}

async function uniquifyManifestNumber(db: DbClient, base: string, excludeManifestId: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const [hit] = await db
      .select({ id: loadingManifests.id })
      .from(loadingManifests)
      .where(and(eq(loadingManifests.manifestNumber, candidate), ne(loadingManifests.id, excludeManifestId)))
      .limit(1);
    if (!hit) {
      return candidate;
    }
    candidate = `${base} (${i})`;
  }
  return `${base}-${Date.now().toString().slice(-6)}`;
}

/**
 * При привязке/смене рейса: город ПН и партий берётся из рейса;
 * номер ПН пересобирается под новый рейс/город.
 */
export async function syncLoadingManifestDestinationFromTrip(
  db: DbClient,
  input: {
    manifestId: string;
    tripNumber: string;
    tripDestinationCode: string | null;
  },
): Promise<void> {
  const tripDest = input.tripDestinationCode?.trim() ?? "";
  if (!tripDest) {
    return;
  }

  const [manifest] = await db
    .select({
      id: loadingManifests.id,
      destinationCode: loadingManifests.destinationCode,
      docDate: loadingManifests.docDate,
      manifestNumber: loadingManifests.manifestNumber,
    })
    .from(loadingManifests)
    .where(eq(loadingManifests.id, input.manifestId))
    .limit(1);
  if (!manifest) {
    return;
  }

  const [destRow] = await db
    .select({ displayName: shipDestinations.displayName })
    .from(shipDestinations)
    .where(eq(shipDestinations.code, tripDest))
    .limit(1);
  const destLabel = destRow?.displayName?.trim() || tripDest;

  const nextNumber = await uniquifyManifestNumber(
    db,
    buildLoadingManifestNumberForTripDestination({
      tripNumber: input.tripNumber,
      destinationLabel: destLabel,
      docDate: manifest.docDate,
    }),
    input.manifestId,
  );

  const destinationChanged = manifest.destinationCode !== tripDest;
  const numberChanged = manifest.manifestNumber.trim() !== nextNumber;

  if (destinationChanged || numberChanged) {
    await db
      .update(loadingManifests)
      .set({
        ...(destinationChanged ? { destinationCode: tripDest } : {}),
        ...(numberChanged ? { manifestNumber: nextNumber } : {}),
      })
      .where(eq(loadingManifests.id, input.manifestId));
  }

  if (!destinationChanged) {
    return;
  }

  const lineBatchIds = await db
    .select({ batchId: loadingManifestLines.batchId })
    .from(loadingManifestLines)
    .where(eq(loadingManifestLines.manifestId, input.manifestId));
  const batchIds = [...new Set(lineBatchIds.map((r) => r.batchId))];
  if (batchIds.length === 0) {
    return;
  }

  await db
    .update(batches)
    .set({ destination: tripDest })
    .where(and(inArray(batches.id, batchIds), ne(batches.destination, tripDest)));
}
