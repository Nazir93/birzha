import { and, eq } from "drizzle-orm";

import type { SyncIdempotencyRepository } from "../../application/ports/sync-idempotency.port.js";
import type { DbClient } from "../../db/client.js";
import { syncProcessedActions } from "../../db/schema.js";

export class DrizzleSyncIdempotencyRepository implements SyncIdempotencyRepository {
  constructor(private readonly db: DbClient) {}

  async hasProcessed(deviceId: string, localActionId: string): Promise<boolean> {
    const rows = await this.db
      .select({ d: syncProcessedActions.deviceId })
      .from(syncProcessedActions)
      .where(and(eq(syncProcessedActions.deviceId, deviceId), eq(syncProcessedActions.localActionId, localActionId)))
      .limit(1);
    return rows.length > 0;
  }

  async markProcessed(deviceId: string, localActionId: string): Promise<void> {
    await this.db.insert(syncProcessedActions).values({ deviceId, localActionId });
  }
}
