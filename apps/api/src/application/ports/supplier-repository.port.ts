export type SupplierRecord = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export interface SupplierRepository {
  findActiveById(id: string): Promise<SupplierRecord | null>;
  findById(id: string): Promise<SupplierRecord | null>;
  /** Активный с тем же именем (без учёта регистра), если есть. */
  findActiveByName(name: string): Promise<SupplierRecord | null>;
  listAll(): Promise<SupplierRecord[]>;
  /** Следующий порядковый № (max(sort_order)+1). */
  nextSortOrder(): Promise<number>;
  /**
   * Создать тепличника.
   * Если `sortOrder` не задан или ≤ 0 — назначается следующий порядковый номер.
   */
  create(name: string, sortOrder?: number): Promise<SupplierRecord>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
