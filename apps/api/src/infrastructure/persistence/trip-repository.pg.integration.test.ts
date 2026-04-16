import path from "node:path";
import { fileURLToPath } from "node:url";

import { Trip } from "@birzha/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DbClient } from "../../db/client.js";
import * as schema from "../../db/schema.js";

import { DrizzleTripRepository } from "./drizzle-trip.repository.js";

const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)("DrizzleTripRepository (PostgreSQL)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: DbClient;
  let repo: DrizzleTripRepository;

  beforeAll(async () => {
    sql = postgres(pgUrl!, { max: 1 });
    db = drizzle(sql, { schema });
    const dir = path.dirname(fileURLToPath(import.meta.url));
    await migrate(db, { migrationsFolder: path.join(dir, "../../../drizzle") });
    repo = new DrizzleTripRepository(db);
  }, 60_000);

  afterAll(async () => {
    await sql.end({ timeout: 10 });
  });

  it("сохраняет и загружает рейс", async () => {
    const id = `it-trip-${crypto.randomUUID()}`;
    const trip = Trip.create({ id, tripNumber: `Н-${id.slice(0, 8)}` });

    await repo.save(trip);

    const loaded = await repo.findById(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.getTripNumber()).toBe(trip.getTripNumber());
    expect(loaded!.getStatus()).toBe("open");
  });

  it("list возвращает сохранённые рейсы", async () => {
    const id = `it-list-${crypto.randomUUID()}`;
    await repo.save(Trip.create({ id, tripNumber: `ZZ-${id.slice(0, 6)}` }));

    const list = await repo.list();
    expect(list.some((t) => t.getId() === id)).toBe(true);
  });
});
