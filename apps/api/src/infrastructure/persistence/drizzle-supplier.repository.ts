import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import type { SupplierRecord, SupplierRepository } from "../../application/ports/supplier-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { suppliers } from "../../db/schema.js";

export class DrizzleSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DbClient) {}

  async findActiveById(id: string): Promise<SupplierRecord | null> {
    const r = await this.findById(id);
    if (!r || !r.isActive) {
      return null;
    }
    return r;
  }

  async findById(id: string): Promise<SupplierRecord | null> {
    const rows = await this.db.select().from(suppliers).where(eq(suppliers.id, id.trim())).limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return { id: r.id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive };
  }

  async findActiveByName(name: string): Promise<SupplierRecord | null> {
    const n = name.trim();
    if (!n) {
      return null;
    }
    const rows = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.isActive, true), sql`lower(${suppliers.name}) = ${n.toLowerCase()}`))
      .limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return { id: r.id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive };
  }

  async listAll(): Promise<SupplierRecord[]> {
    const rows = await this.db
      .select()
      .from(suppliers)
      .orderBy(asc(suppliers.sortOrder), asc(suppliers.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
  }

  async create(name: string, sortOrder = 0): Promise<SupplierRecord> {
    const id = randomUUID();
    const n = name.trim();
    await this.db.insert(suppliers).values({
      id,
      name: n,
      sortOrder,
      isActive: true,
    });
    return { id, name: n, sortOrder, isActive: true };
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await this.db.update(suppliers).set({ isActive }).where(eq(suppliers.id, id.trim()));
  }
}
