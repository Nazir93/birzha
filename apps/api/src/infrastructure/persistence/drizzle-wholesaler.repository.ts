import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import type { WholesalerRecord, WholesalerRepository } from "../../application/ports/wholesaler-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { wholesalers } from "../../db/schema.js";

export class DrizzleWholesalerRepository implements WholesalerRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveById(id: string): Promise<WholesalerRecord | null> {
    const r = await this.findById(id);
    if (!r || !r.isActive) {
      return null;
    }
    return r;
  }

  async findById(id: string): Promise<WholesalerRecord | null> {
    const rows = await this.db
      .select()
      .from(wholesalers)
      .where(eq(wholesalers.id, id.trim()))
      .limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return {
      id: r.id,
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    };
  }

  async listAll(): Promise<WholesalerRecord[]> {
    const rows = await this.db
      .select()
      .from(wholesalers)
      .orderBy(asc(wholesalers.sortOrder), asc(wholesalers.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
  }

  async create(name: string, sortOrder = 0): Promise<WholesalerRecord> {
    const id = randomUUID();
    const n = name.trim();
    await this.db.insert(wholesalers).values({
      id,
      name: n,
      sortOrder,
      isActive: true,
    });
    return { id, name: n, sortOrder, isActive: true };
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.update(wholesalers).set({ isActive }).where(eq(wholesalers.id, id.trim()));
  }
}
