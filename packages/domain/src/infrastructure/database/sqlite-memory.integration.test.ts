import { describe, expect, it } from "vitest";
import { openMemorySqlite } from "./sqlite-memory.js";

describe("SQLite in-memory (инфраструктура, sql.js)", () => {
  it("сохраняет и читает строку партии", async () => {
    const db = await openMemorySqlite();

    db.run(
      `INSERT INTO batch_rows (
        id,
        purchase_id,
        total_kg,
        price_per_kg,
        pending_inbound_kg,
        on_warehouse_kg,
        in_transit_kg,
        sold_kg,
        written_off_kg
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "batch-1",
        "purchase-1",
        1000,
        42,
        0,
        1000,
        0,
        0,
        0,
      ],
    );

    const stmt = db.prepare(
      `SELECT total_kg AS totalKg, on_warehouse_kg AS onWarehouseKg FROM batch_rows WHERE id = ?`,
    );
    stmt.bind([`batch-1`]);
    expect(stmt.step()).toBe(true);
    const row = stmt.getAsObject() as { totalKg: number; onWarehouseKg: number };
    stmt.free();

    expect(row.totalKg).toBe(1000);
    expect(row.onWarehouseKg).toBe(1000);
    db.close();
  });
});
