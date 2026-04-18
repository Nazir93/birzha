import { asc, eq } from "drizzle-orm";

import type { WarehouseRecord, WarehouseRepository } from "../../application/ports/warehouse-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { warehouses } from "../../db/schema.js";

export class DrizzleWarehouseRepository implements WarehouseRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<WarehouseRecord | null> {
    const rows = await this.db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return { id: r.id, code: r.code, name: r.name };
  }

  async list(): Promise<WarehouseRecord[]> {
    const rows = await this.db.select().from(warehouses).orderBy(asc(warehouses.code));
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  }
}
