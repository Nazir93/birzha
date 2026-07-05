import type { Batch } from "@birzha/domain";

/** Фильтр списка партий (GET /api/batches?ids=&search=&limit=&offset=&warehouseId=&stockOnly=). Без аргумента — полный список. */
export type BatchListFilter = {
  ids?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  warehouseId?: string;
  /** Только партии с остатком на складе > 0. */
  stockOnly?: boolean;
};

export interface BatchRepository {
  save(batch: Batch): Promise<void>;
  findById(id: string): Promise<Batch | null>;
  /** Блокирует строку партии до конца транзакции (PostgreSQL `FOR UPDATE`). */
  findByIdForUpdate(id: string): Promise<Batch | null>;
  list(filter?: BatchListFilter): Promise<Batch[]>;
  count(filter?: Omit<BatchListFilter, "limit" | "offset" | "ids">): Promise<number>;
  deleteById(id: string): Promise<void>;
}
