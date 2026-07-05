import path from "node:path";
import { fileURLToPath } from "node:url";

import { Batch } from "@birzha/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "../../db/client.js";
import * as schema from "../../db/schema.js";

import { DrizzleBatchRepository } from "./drizzle-batch.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("DrizzleBatchRepository (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;
  let repo: DrizzleBatchRepository;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
    repo = new DrizzleBatchRepository(db);
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("сохраняет и загружает партию с тем же снимком состояния", async () => {
    const id = `it-${crypto.randomUUID()}`;
    const batch = Batch.create({
      id,
      purchaseId: "p-it",
      totalKg: 250.5,
      pricePerKg: 3.25,
      distribution: "on_hand",
    });

    await repo.save(batch);

    const loaded = await repo.findById(id);
    expect(loaded).not.toBeNull();

    const a = batch.toPersistenceState();
    const b = loaded!.toPersistenceState();
    expect(b.id).toBe(a.id);
    expect(b.purchaseId).toBe(a.purchaseId);
    expect(b.totalGrams).toBe(a.totalGrams);
    expect(b.pricePerKg).toBeCloseTo(a.pricePerKg, 6);
    expect(b.pendingInboundGrams).toBe(a.pendingInboundGrams);
    expect(b.onWarehouseGrams).toBe(a.onWarehouseGrams);
    expect(b.inTransitGrams).toBe(a.inTransitGrams);
    expect(b.soldGrams).toBe(a.soldGrams);
    expect(b.writtenOffGrams).toBe(a.writtenOffGrams);
  });
});
