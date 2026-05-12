export type WholesalerRecord = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export interface WholesalerRepository {
  findActiveById(id: string): Promise<WholesalerRecord | null>;
  /** Любой статус `is_active` (для проверки существования при DELETE). */
  findById(id: string): Promise<WholesalerRecord | null>;
  /** Все строки (в т.ч. неактивные) — для админки и фильтра на клиенте. */
  listAll(): Promise<WholesalerRecord[]>;
  create(name: string, sortOrder?: number): Promise<WholesalerRecord>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
