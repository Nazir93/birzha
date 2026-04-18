import type { Batch } from "@birzha/domain";

export interface BatchRepository {
  save(batch: Batch): Promise<void>;
  findById(id: string): Promise<Batch | null>;
  list(): Promise<Batch[]>;
}
