import { and, eq } from "drizzle-orm";

import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
  PushSubscriptionUpsert,
} from "../../application/ports/push-subscription.port.js";
import type { DbClient } from "../../db/client.js";
import { pushSubscriptions, userRoles } from "../../db/schema.js";

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: DbClient) {}

  async upsert(row: PushSubscriptionUpsert): Promise<void> {
    const now = new Date();
    await this.db
      .insert(pushSubscriptions)
      .values({
        endpoint: row.endpoint,
        userId: row.userId,
        p256dh: row.p256dh,
        auth: row.auth,
        userAgent: row.userAgent,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: row.userId,
          p256dh: row.p256dh,
          auth: row.auth,
          userAgent: row.userAgent,
          updatedAt: now,
        },
      });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deleteByEndpointForUser(endpoint: string, userId: string): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  }

  async listForGlobalRole(roleCode: string): Promise<PushSubscriptionRecord[]> {
    const rows = await this.db
      .select({
        endpoint: pushSubscriptions.endpoint,
        userId: pushSubscriptions.userId,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
        userAgent: pushSubscriptions.userAgent,
      })
      .from(pushSubscriptions)
      .innerJoin(userRoles, eq(pushSubscriptions.userId, userRoles.userId))
      .where(
        and(
          eq(userRoles.roleCode, roleCode),
          eq(userRoles.scopeType, "global"),
          eq(userRoles.scopeId, ""),
        ),
      );
    return rows;
  }
}
