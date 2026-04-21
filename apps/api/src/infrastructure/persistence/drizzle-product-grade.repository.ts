import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { ProductGradeCodeConflictError } from "../../application/errors.js";
import type {
  CreateProductGradeInput,
  ProductGradeRecord,
  ProductGradeRepository,
} from "../../application/ports/product-grade-repository.port.js";
import type { DbClient } from "../../db/client.js";
import { productGrades } from "../../db/schema.js";

import { isPgUniqueViolation } from "./warehouse-code.js";

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
    const rows = await this.db
      .select()
      .from(productGrades)
      .where(eq(productGrades.isActive, true))
      .orderBy(asc(productGrades.sortOrder));
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.displayName,
      sortOrder: r.sortOrder,
    }));
  }

  async create(input: CreateProductGradeInput): Promise<ProductGradeRecord> {
    const id = `pg-${randomUUID()}`;
    const code = input.code.trim();
    const displayName = input.displayName.trim();
    const sortOrder = input.sortOrder ?? 100;
    try {
      await this.db.insert(productGrades).values({
        id,
        code,
        displayName,
        sortOrder,
        isActive: true,
      });
    } catch (e) {
      if (isPgUniqueViolation(e)) {
        throw new ProductGradeCodeConflictError(code);
      }
      throw e;
    }
    return { id, code, displayName, sortOrder };
  }
}
