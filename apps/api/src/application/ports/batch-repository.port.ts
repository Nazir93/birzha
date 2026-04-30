import type { Batch } from "@birzha/domain";

/** Фильтр списка партий (GET /api/batches?ids=&search=&limit=&offset=). Без аргумента — полный список. */
export type BatchListFilter = {
  ids?: string[];
  search?: string;
  limit?: number;
  offset?: number;
};

export interface BatchRepository {
  save(batch: Batch): Promise<void>;
  findById(id: string): Promise<Batch | null>;
  list(filter?: BatchListFilter): Promise<Batch[]>;
  deleteById(id: string): Promise<void>;
}
