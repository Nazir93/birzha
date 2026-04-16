import type { SyncIdempotencyRepository } from "../ports/sync-idempotency.port.js";

export class InMemorySyncIdempotencyRepository implements SyncIdempotencyRepository {
  private readonly keys = new Set<string>();

  private key(deviceId: string, localActionId: string): string {
    return `${deviceId}\0${localActionId}`;
  }

  async hasProcessed(deviceId: string, localActionId: string): Promise<boolean> {
    return this.keys.has(this.key(deviceId, localActionId));
  }

  async markProcessed(deviceId: string, localActionId: string): Promise<void> {
    this.keys.add(this.key(deviceId, localActionId));
  }
}
