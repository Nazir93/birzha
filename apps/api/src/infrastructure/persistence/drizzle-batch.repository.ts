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
    const row = persistenceStateToInsert(state);

    const existing = await this.db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.id, state.id))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(batches).values(row);
      return;
    }

    await this.db.update(batches).set(row).where(eq(batches.id, state.id));
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
}
