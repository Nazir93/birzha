export type PushSubscriptionRecord = {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

export type PushSubscriptionUpsert = {
  endpoint: string;
  userId: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

/** Хранение Web Push подписок (PWA). */
export interface PushSubscriptionRepository {
  upsert(row: PushSubscriptionUpsert): Promise<void>;
  deleteByEndpoint(endpoint: string): Promise<void>;
  deleteByEndpointForUser(endpoint: string, userId: string): Promise<void>;
  /** Подписки пользователей с глобальной ролью `admin`. */
  listForGlobalRole(roleCode: string): Promise<PushSubscriptionRecord[]>;
}
