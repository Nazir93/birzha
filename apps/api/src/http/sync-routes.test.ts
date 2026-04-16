import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("POST /sync", () => {
  it("идемпотентность: второй запрос с тем же localActionId — duplicate", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    const meta = JSON.parse((await app.inject({ method: "GET", url: "/meta" })).body) as { syncApi: string };
    expect(meta.syncApi).toBe("enabled");

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "sync-b1",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "sync-t1", tripNumber: "С-01" },
    });
    await app.inject({
      method: "POST",
      url: "/batches/sync-b1/ship-to-trip",
      payload: { kg: 40, tripId: "sync-t1" },
    });

    const body = {
      deviceId: "device-a",
      localActionId: "action-1",
      actionType: "sell_from_trip" as const,
      payload: {
        batchId: "sync-b1",
        tripId: "sync-t1",
        kg: 10,
        saleId: "sale-1",
        pricePerKg: 12,
      },
    };

    let r = await app.inject({ method: "POST", url: "/sync", payload: body });
    expect(r.statusCode).toBe(200);
    let res = JSON.parse(r.body) as { status: string; duplicate?: boolean };
    expect(res.status).toBe("ok");
    expect(res.duplicate).toBeUndefined();

    r = await app.inject({ method: "POST", url: "/sync", payload: body });
    expect(r.statusCode).toBe(200);
    res = JSON.parse(r.body) as { status: string; duplicate?: boolean };
    expect(res.status).toBe("ok");
    expect(res.duplicate).toBe(true);

    await app.close();
  });

  it("отклонение при недостатке массы — 200 и status rejected", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "sync-b2",
        purchaseId: "p-1",
        totalKg: 50,
        pricePerKg: 1,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "sync-t2", tripNumber: "С-02" },
    });
    await app.inject({
      method: "POST",
      url: "/batches/sync-b2/ship-to-trip",
      payload: { kg: 5, tripId: "sync-t2" },
    });

    const r = await app.inject({
      method: "POST",
      url: "/sync",
      payload: {
        deviceId: "d1",
        localActionId: "a2",
        actionType: "sell_from_trip",
        payload: {
          batchId: "sync-b2",
          tripId: "sync-t2",
          kg: 100,
          saleId: "s2",
          pricePerKg: 1,
        },
      },
    });
    expect(r.statusCode).toBe(200);
    const res = JSON.parse(r.body) as { status: string; reason?: string; errorCode?: string };
    expect(res.status).toBe("rejected");
    expect(res.errorCode).toBe("insufficient_stock_for_trip");

    await app.close();
  });

  it("некорректное тело — 400", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null, batchRepository: new InMemoryBatchRepository() });
    const r = await app.inject({
      method: "POST",
      url: "/sync",
      payload: { deviceId: "", localActionId: "x", actionType: "create_trip", payload: {} },
    });
    expect(r.statusCode).toBe(400);
    await app.close();
  });
});
