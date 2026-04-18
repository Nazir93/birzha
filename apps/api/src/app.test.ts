import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadEnv } from "./config.js";

describe("API", () => {
  it("GET /health возвращает 200", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string };
    expect(body.status).toBe("ok");
    await app.close();
  });

  it("GET /health/ready без БД сообщает not_configured", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null });
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { database: string };
    expect(body.database).toBe("not_configured");
    await app.close();
  });

  it("GET /meta показывает batchesApi при отключённой БД", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null });
    const res = await app.inject({ method: "GET", url: "/meta" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      batchesApi: string;
      purchaseDocumentsApi: string;
      tripsApi: string;
      tripShipmentLedger: string;
      tripSaleLedger: string;
      tripShortageLedger: string;
      counterpartyCatalogApi: string;
      syncApi: string;
      authApi: string;
      requireApiAuth: string;
    };
    expect(body.batchesApi).toBe("disabled");
    expect(body.purchaseDocumentsApi).toBe("disabled");
    expect(body.tripsApi).toBe("disabled");
    expect(body.tripShipmentLedger).toBe("disabled");
    expect(body.tripSaleLedger).toBe("disabled");
    expect(body.tripShortageLedger).toBe("disabled");
    expect(body.counterpartyCatalogApi).toBe("disabled");
    expect(body.syncApi).toBe("disabled");
    expect(body.authApi).toBe("disabled");
    expect(body.requireApiAuth).toBe("disabled");
    await app.close();
  });
});
