import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { CounterpartyNotFoundError } from "../../application/errors.js";
import type { CounterpartyRecord, CounterpartyRepository } from "../../application/ports/counterparty-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { counterparties } from "../../db/schema.js";

export class DrizzleCounterpartyRepository implements CounterpartyRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveById(id: string): Promise<CounterpartyRecord | null> {
    const rows = await this.db
      .select()
      .from(counterparties)
      .where(and(eq(counterparties.id, id), eq(counterparties.isActive, true)))
      .limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return { id: r.id, displayName: r.displayName };
  }

  async listActive(): Promise<CounterpartyRecord[]> {
    const rows = await this.db
      .select()
      .from(counterparties)
      .where(eq(counterparties.isActive, true))
      .orderBy(asc(counterparties.displayName));
    return rows.map((r) => ({ id: r.id, displayName: r.displayName }));
  }

  async create(displayName: string): Promise<CounterpartyRecord> {
    const id = randomUUID();
    const name = displayName.trim();
    await this.db.insert(counterparties).values({
      id,
      displayName: name,
      isActive: true,
    });
    return { id, displayName: name };
  }

  async deleteById(counterpartyId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(counterparties)
      .where(eq(counterparties.id, counterpartyId))
      .limit(1);
    if (!rows[0]) {
      throw new CounterpartyNotFoundError(counterpartyId);
    }
    const del = await this.db
      .delete(counterparties)
      .where(eq(counterparties.id, counterpartyId))
      .returning({ id: counterparties.id });
    if (del.length === 0) {
      throw new CounterpartyNotFoundError(counterpartyId);
    }
  }
}
