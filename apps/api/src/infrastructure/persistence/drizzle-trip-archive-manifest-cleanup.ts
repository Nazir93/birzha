import { eq } from "drizzle-orm";

import type { TripArchiveManifestCleanupPort } from "../../application/ports/trip-archive-manifest-cleanup.port.js";
import type { DbClient } from "../../db/client.js";
import { loadingManifests } from "../../db/schema.js";

export class DrizzleTripArchiveManifestCleanup implements TripArchiveManifestCleanupPort {
  constructor(private readonly db: DbClient) {}

  async deleteManifestsByTripId(tripId: string): Promise<void> {
    await this.db.delete(loadingManifests).where(eq(loadingManifests.tripId, tripId));
  }
}
