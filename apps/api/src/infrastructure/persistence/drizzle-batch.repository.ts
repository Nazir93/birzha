import { Batch, type BatchPersistenceState } from "@birzha/domain";
import { asc, eq, gt, ilike, inArray, and, type SQL } from "drizzle-orm";

import type { BatchListFilter, BatchRepository } from "../../application/ports/batch-repository.port.js";
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

  async list(filter?: BatchListFilter): Promise<Batch[]> {
    if (!filter) {
      const rows = await this.db.select().from(batches).orderBy(asc(batches.id));
      return rows.map((row) => Batch.restoreFromPersistence(rowToPersistenceState(row)));
    }

    if (filter.ids && filter.ids.length > 0) {
      const uniqueIds = [...new Set(filter.ids.map((id) => id.trim()).filter(Boolean))];
      if (uniqueIds.length === 0) {
        return [];
      }
      const rows = await this.db.select().from(batches).where(inArray(batches.id, uniqueIds));
      const byId = new Map(rows.map((row) => [row.id, row] as const));
      return uniqueIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row != null)
        .map((row) => Batch.restoreFromPersistence(rowToPersistenceState(row)));
    }

    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    const conditions: SQL[] = [];
    if (filter.search?.trim()) {
      conditions.push(ilike(batches.id, `%${filter.search.trim()}%`));
    }
    if (filter.warehouseId?.trim()) {
      conditions.push(eq(batches.warehouseId, filter.warehouseId.trim()));
    }
    if (filter.stockOnly) {
      conditions.push(gt(batches.onWarehouseGrams, 0n));
    }
    const base = this.db.select().from(batches);
    const filtered =
      conditions.length === 0 ? base : conditions.length === 1 ? base.where(conditions[0]) : base.where(and(...conditions));
    const rows = await filtered.orderBy(asc(batches.id)).limit(limit).offset(offset);
    return rows.map((row) => Batch.restoreFromPersistence(rowToPersistenceState(row)));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(batches).where(eq(batches.id, id));
  }
}
