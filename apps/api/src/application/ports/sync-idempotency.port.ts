/** Идемпотентность офлайн-действий: пара (deviceId, localActionId) не должна применяться дважды. */
export interface SyncIdempotencyRepository {
  hasProcessed(deviceId: string, localActionId: string): Promise<boolean>;
  /** Вызывать только после успешного применения действия на сервере. */
  markProcessed(deviceId: string, localActionId: string): Promise<void>;
}
