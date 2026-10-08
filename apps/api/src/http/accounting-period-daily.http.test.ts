import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("GET /accounting/period-daily", () => {
  it("отдаёт ряд по дням периода с продажей за сегодня и расходом рейса", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null, batchRepository: new InMemoryBatchRepository() });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: { id: "pd-b1", purchaseId: "p-1", totalKg: 100, pricePerKg: 10, distribution: "on_hand" },
    });
    await app.inject({ method: "POST", url: "/trips", payload: { id: "pd-t1", tripNumber: "Ф-PD" } });
    await app.inject({
      method: "POST",
      url: "/batches/pd-b1/ship-to-trip",
      payload: { kg: 50, tripId: "pd-t1" },
    });
    const sell = await app.inject({
      method: "POST",
      url: "/batches/pd-b1/sell-from-trip",
      payload: { tripId: "pd-t1", kg: 10, saleId: "pd-sale-1", pricePerKg: 20, paymentKind: "cash" },
    });
    expect(sell.statusCode).toBe(200);

    const today = new Date().toISOString().slice(0, 10);
    const exp = await app.inject({
      method: "POST",
      url: "/accounting/trips/pd-t1/expenses",
      payload: { category: "fuel", amountKopecks: 1500, expenseDate: today },
    });
    expect([200, 201]).toContain(exp.statusCode);

    const r = await app.inject({ method: "GET", url: `/accounting/period-daily?from=${today}&to=${today}` });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body) as {
      from: string;
      to: string;
      days: { day: string; revenueTotalKopecks: string; soldGrams: string; expensesKopecks: string }[];
    };
    expect(body.from).toBe(today);
    expect(body.days).toHaveLength(1);
    expect(body.days[0]).toMatchObject({
      day: today,
      revenueTotalKopecks: "20000",
      soldGrams: "10000",
      expensesKopecks: "1500",
    });

    const bad = await app.inject({ method: "GET", url: "/accounting/period-daily?from=2026-10-09&to=2026-10-01" });
    expect(bad.statusCode).toBe(400);

    await app.close();
  });
});
