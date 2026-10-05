import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("Seller field expenses HTTP", () => {
  it("трата по рейсу → сверка к сдаче = нал − траты", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "sfe-b1",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "sfe-t1", tripNumber: "Ф-SFE" },
    });
    await app.inject({
      method: "POST",
      url: "/batches/sfe-b1/ship-to-trip",
      payload: { kg: 50, tripId: "sfe-t1" },
    });
    const sell = await app.inject({
      method: "POST",
      url: "/batches/sfe-b1/sell-from-trip",
      payload: {
        tripId: "sfe-t1",
        kg: 10,
        saleId: "sale-sfe-1",
        pricePerKg: 20,
        paymentKind: "cash",
      },
    });
    expect(sell.statusCode).toBe(200);

    let r = await app.inject({
      method: "POST",
      url: "/seller-field-expenses",
      payload: {
        tripId: "sfe-t1",
        expenseDate: "2026-10-01",
        category: "loader",
        amountKopecks: 5000,
        comment: "грузчик",
      },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "GET",
      url: "/seller-field-expenses?tripId=sfe-t1&from=2026-10-01&to=2026-10-31&group=day",
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body) as {
      settlement: { cashKopecks: string; fieldExpensesKopecks: string; cashToHandOverKopecks: string };
      expenses: { category: string }[];
    };
    expect(body.expenses).toHaveLength(1);
    expect(body.expenses[0]!.category).toBe("loader");
    expect(body.settlement.cashKopecks).toBe("20000");
    expect(body.settlement.fieldExpensesKopecks).toBe("5000");
    expect(body.settlement.cashToHandOverKopecks).toBe("15000");

    r = await app.inject({ method: "GET", url: "/trips/sfe-t1/shipment-report" });
    expect(r.statusCode).toBe(200);
    const report = JSON.parse(r.body) as {
      financials: { fieldExpensesKopecks: string; cashToHandOverKopecks: string };
      fieldExpenses: { category: string; amountKopecks: string; comment: string | null; expenseDate: string }[];
    };
    expect(report.financials.fieldExpensesKopecks).toBe("5000");
    expect(report.financials.cashToHandOverKopecks).toBe("15000");
    expect(report.fieldExpenses).toEqual([
      expect.objectContaining({
        category: "loader",
        amountKopecks: "5000",
        comment: "грузчик",
        expenseDate: "2026-10-01",
      }),
    ]);

    await app.close();
  });

  it("аренда / бронь по рейсу вычитается из к сдаче и попадает в отчёт", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "sfe-rent-b1",
        purchaseId: "p-rent",
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "sfe-rent-t1", tripNumber: "Ф-RENT" },
    });
    await app.inject({
      method: "POST",
      url: "/batches/sfe-rent-b1/ship-to-trip",
      payload: { kg: 40, tripId: "sfe-rent-t1" },
    });
    const sell = await app.inject({
      method: "POST",
      url: "/batches/sfe-rent-b1/sell-from-trip",
      payload: {
        tripId: "sfe-rent-t1",
        kg: 10,
        saleId: "sale-rent-1",
        pricePerKg: 20,
        paymentKind: "cash",
      },
    });
    expect(sell.statusCode).toBe(200);

    const created = await app.inject({
      method: "POST",
      url: "/seller-field-expenses",
      payload: {
        tripId: "sfe-rent-t1",
        expenseDate: "2026-10-04",
        category: "rent",
        amountKopecks: 7000,
        comment: "бронь точки",
      },
    });
    expect(created.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/seller-field-expenses?tripId=sfe-rent-t1&from=2026-10-01&to=2026-10-31",
    });
    expect(list.statusCode).toBe(200);
    const body = JSON.parse(list.body) as {
      expenses: { category: string; comment: string | null }[];
      settlement: { cashKopecks: string; fieldExpensesKopecks: string; cashToHandOverKopecks: string };
    };
    expect(body.expenses).toEqual([
      expect.objectContaining({ category: "rent", comment: "бронь точки" }),
    ]);
    expect(body.settlement.cashKopecks).toBe("20000");
    expect(body.settlement.fieldExpensesKopecks).toBe("7000");
    expect(body.settlement.cashToHandOverKopecks).toBe("13000");

    const reportRes = await app.inject({ method: "GET", url: "/trips/sfe-rent-t1/shipment-report" });
    expect(reportRes.statusCode).toBe(200);
    const report = JSON.parse(reportRes.body) as {
      financials: { fieldExpensesKopecks: string; cashToHandOverKopecks: string };
      fieldExpenses: { category: string; amountKopecks: string }[];
    };
    expect(report.financials.fieldExpensesKopecks).toBe("7000");
    expect(report.financials.cashToHandOverKopecks).toBe("13000");
    expect(report.fieldExpenses).toEqual([
      expect.objectContaining({ category: "rent", amountKopecks: "7000" }),
    ]);

    await app.close();
  });
});
