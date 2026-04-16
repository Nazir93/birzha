import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("Batch HTTP", () => {
  it("POST /batches создаёт партию", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    const res = await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "http-b1",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });

    expect(res.statusCode).toBe(201);
    const loaded = await batches.findById("http-b1");
    expect(loaded).not.toBeNull();
    expect(loaded!.remainingKg()).toBe(100);
    await app.close();
  });

  it("POST /batches с неверным телом — 400", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
    });

    const res = await app.inject({
      method: "POST",
      url: "/batches",
      payload: { id: "", purchaseId: "p", totalKg: -1, pricePerKg: 0, distribution: "on_hand" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("сквозной сценарий: receive → ship → sell", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "flow-1",
        purchaseId: "p-flow",
        totalKg: 500,
        pricePerKg: 8,
        distribution: "awaiting_receipt",
      },
    });

    let r = await app.inject({
      method: "POST",
      url: "/batches/flow-1/receive-on-warehouse",
      payload: { kg: 500 },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "t-1", tripNumber: "Ф-flow" },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: "/batches/flow-1/ship-to-trip",
      payload: { kg: 200, tripId: "t-1" },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({ method: "GET", url: "/trips/t-1/shipment-report" });
    expect(r.statusCode).toBe(200);
    const report = JSON.parse(r.body) as {
      shipment: { totalGrams: string; byBatch: { batchId: string; grams: string }[] };
      sales: {
        totalGrams: string;
        totalRevenueKopecks: string;
        totalCashKopecks: string;
        totalDebtKopecks: string;
      };
      shortage: { totalGrams: string };
      financials: { grossProfitKopecks: string };
    };
    expect(report.shipment.totalGrams).toBe("200000");
    expect(report.shipment.byBatch).toEqual([{ batchId: "flow-1", grams: "200000" }]);
    expect(report.sales.totalGrams).toBe("0");
    expect(report.sales.totalRevenueKopecks).toBe("0");
    expect(report.sales.totalCashKopecks).toBe("0");
    expect(report.sales.totalDebtKopecks).toBe("0");
    expect(report.shortage.totalGrams).toBe("0");
    expect(report.financials.grossProfitKopecks).toBe("0");

    r = await app.inject({
      method: "POST",
      url: "/batches/flow-1/sell-from-trip",
      payload: { tripId: "t-1", kg: 50, saleId: "s-1", pricePerKg: 12 },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({ method: "GET", url: "/trips/t-1/shipment-report" });
    const reportAfter = JSON.parse(r.body) as {
      sales: { totalGrams: string; totalRevenueKopecks: string; totalCashKopecks: string; totalDebtKopecks: string };
    };
    expect(reportAfter.sales.totalGrams).toBe("50000");
    expect(reportAfter.sales.totalRevenueKopecks).toBe("60000");
    expect(reportAfter.sales.totalCashKopecks).toBe("60000");
    expect(reportAfter.sales.totalDebtKopecks).toBe("0");

    const b = await batches.findById("flow-1");
    expect(b!.remainingKg()).toBe(450);
    expect(b!.totalProcessedKg()).toBe(50);
    await app.close();
  });

  it("POST /batches/:id/record-trip-shortage сверх отгруженного — 409 trip_shortage_exceeds_net", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "sh-409",
        purchaseId: "p-1",
        totalKg: 200,
        pricePerKg: 1,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "t-409", tripNumber: "Ф-409" },
    });
    let r = await app.inject({
      method: "POST",
      url: "/batches/sh-409/ship-to-trip",
      payload: { kg: 50, tripId: "t-409" },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({
      method: "POST",
      url: "/batches/sh-409/record-trip-shortage",
      payload: { tripId: "t-409", kg: 60, reason: "слишком много" },
    });
    expect(r.statusCode).toBe(409);
    const body = JSON.parse(r.body) as { error: string; availableGrams: string; requestedGrams: string };
    expect(body.error).toBe("trip_shortage_exceeds_net");
    expect(body.availableGrams).toBe("50000");
    expect(body.requestedGrams).toBe("60000");

    await app.close();
  });

  it("POST sell-from-trip paymentKind=mixed без cashKopecksMixed — 400", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });
    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "pay-mix",
        purchaseId: "p-1",
        totalKg: 50,
        pricePerKg: 1,
        distribution: "on_hand",
      },
    });
    await app.inject({ method: "POST", url: "/trips", payload: { id: "t-mix", tripNumber: "Ф-mix" } });
    await app.inject({
      method: "POST",
      url: "/batches/pay-mix/ship-to-trip",
      payload: { kg: 5, tripId: "t-mix" },
    });
    const r = await app.inject({
      method: "POST",
      url: "/batches/pay-mix/sell-from-trip",
      payload: {
        tripId: "t-mix",
        kg: 5,
        saleId: "s-mix",
        pricePerKg: 2,
        paymentKind: "mixed",
      },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });
});
