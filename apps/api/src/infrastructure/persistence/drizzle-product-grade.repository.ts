import { asc, eq } from "drizzle-orm";

import type { ProductGradeRecord, ProductGradeRepository } from "../../application/ports/product-grade-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { productGrades } from "../../db/schema.js";

export class DrizzleProductGradeRepository implements ProductGradeRepository {
  constructor(private readonly db: DbClient) {}

  async findById(id: string): Promise<ProductGradeRecord | null> {
    const rows = await this.db.select().from(productGrades).where(eq(productGrades.id, id)).limit(1);
    const r = rows[0];
    if (!r) {
      return null;
    }
    return {
      id: r.id,
      code: r.code,
      displayName: r.displayName,
      sortOrder: r.sortOrder,
    };
  }

  async list(): Promise<ProductGradeRecord[]> {
    const rows = await this.db.select().from(productGrades).orderBy(asc(productGrades.sortOrder));
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.displayName,
      sortOrder: r.sortOrder,
    }));
  }
}
