import { Batch, type BatchPersistenceState } from "@birzha/domain";
import { asc, eq } from "drizzle-orm";

import type { BatchRepository } from "../../application/ports/batch-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { batches } from "../../db/schema.js";

import { persistenceStateToInsert, rowToPersistenceState } from "./batch-row.mapper.js";

export class DrizzleBatchRepository implements BatchRepository {
  constructor(private readonly db: DbClient) {}

  async save(batch: Batch): Promise<void> {
    const state: BatchPersistenceState = batch.toPersistenceState();
    const baseRow = persistenceStateToInsert(state);

    const existing = await this.db
      .select()
      .from(batches)
      .where(eq(batches.id, state.id))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(batches).values({
        ...baseRow,
        qualityTier: null,
        destination: null,
      });
      return;
    }

    const ex = existing[0]!;
    await this.db
      .update(batches)
      .set({
        ...baseRow,
        qualityTier: ex.qualityTier,
        destination: ex.destination,
      })
      .where(eq(batches.id, state.id));
  }

  async findById(id: string): Promise<Batch | null> {
    const rows = await this.db.select().from(batches).where(eq(batches.id, id)).limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return Batch.restoreFromPersistence(rowToPersistenceState(row));
  }

  async list(): Promise<Batch[]> {
    const rows = await this.db.select().from(batches).orderBy(asc(batches.id));
    return rows.map((row) => Batch.restoreFromPersistence(rowToPersistenceState(row)));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(batches).where(eq(batches.id, id));
  }
}
