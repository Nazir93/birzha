import type { DbClient } from "../../db/client.js";
import { assertManifestExists, detachManifestTripId } from "./loading-manifest-trip-detach-context.js";

export class DetachLoadingManifestTripUseCase {
  constructor(private readonly db: DbClient) {}

  async execute(manifestId: string): Promise<void> {
    await assertManifestExists(this.db, manifestId.trim());
    await detachManifestTripId(this.db, manifestId.trim());
  }
}
