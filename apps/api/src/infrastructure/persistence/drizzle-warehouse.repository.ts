import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { WarehouseCodeConflictError, WarehouseNotFoundError } from "../../application/errors.js";
import type {
  CreateWarehouseInput,
  WarehouseRecord,
  WarehouseRepository,
} from "../../application/ports/warehouse-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { warehouses } from "../../db/schema.js";

import { autoWarehouseCode, isPgUniqueViolation } from "./warehouse-code.js";

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

  async deleteById(warehouseId: string): Promise<void> {
    const w = await this.findById(warehouseId);
    if (!w) {
      throw new WarehouseNotFoundError(warehouseId);
    }
    const del = await this.db.delete(warehouses).where(eq(warehouses.id, warehouseId)).returning({ id: warehouses.id });
    if (del.length === 0) {
      throw new WarehouseNotFoundError(warehouseId);
    }
  }

  async create(input: CreateWarehouseInput): Promise<WarehouseRecord> {
    const id = `wh-${randomUUID()}`;
    const name = input.name.trim();
    const explicit = input.code?.trim();
    if (explicit) {
      const code = explicit.toUpperCase();
      try {
        await this.db.insert(warehouses).values({ id, code, name });
      } catch (e) {
        if (isPgUniqueViolation(e)) {
          throw new WarehouseCodeConflictError(code);
        }
        throw e;
      }
      return { id, code, name };
    }
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = autoWarehouseCode();
      try {
        await this.db.insert(warehouses).values({ id, code, name });
        return { id, code, name };
      } catch (e) {
        if (isPgUniqueViolation(e)) {
          continue;
        }
        throw e;
      }
    }
    throw new Error("Не удалось создать склад: повторите попытку");
  }
}
