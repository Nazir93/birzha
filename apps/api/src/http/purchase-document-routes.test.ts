import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("Purchase document HTTP (накладная)", () => {
  it("POST /purchase-documents создаёт документ и партии по строкам", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    const res = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      payload: {
        id: "nakl-1",
        documentNumber: "НФ-100",
        docDate: "2026-04-01",
        warehouseId: "wh-manas",
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            totalKg: 10,
            packageCount: 2,
            pricePerKg: 50,
            lineTotalKopecks: 50_000,
          },
          {
            productGradeId: "pg-n6",
            totalKg: 5,
            pricePerKg: 48,
            lineTotalKopecks: 24_000,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const created = JSON.parse(res.body) as { documentId: string };
    expect(created.documentId).toBe("nakl-1");

    const list = await batches.list();
    expect(list).toHaveLength(2);
    expect(list.every((b) => b.getPurchaseId() === "nakl-1")).toBe(true);
    expect(list.every((b) => b.getWarehouseId() === "wh-manas")).toBe(true);

    const listRes = await app.inject({ method: "GET", url: "/purchase-documents" });
    expect(listRes.statusCode).toBe(200);
    const docs = JSON.parse(listRes.body) as { purchaseDocuments: { id: string; lineCount: number }[] };
    expect(docs.purchaseDocuments.some((d) => d.id === "nakl-1" && d.lineCount === 2)).toBe(true);

    const getRes = await app.inject({ method: "GET", url: "/purchase-documents/nakl-1" });
    expect(getRes.statusCode).toBe(200);
    const detail = JSON.parse(getRes.body) as { lines: { productGradeCode: string }[] };
    expect(detail.lines[0]?.productGradeCode).toBe("№5");

    await app.close();
  });

  it("POST /purchase-documents при неверной сумме строки — 400", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({ env, db: null, batchRepository: new InMemoryBatchRepository() });

    const res = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      payload: {
        documentNumber: "НФ-200",
        docDate: "2026-04-02",
        warehouseId: "wh-kayakent",
        lines: [
          {
            productGradeId: "pg-n5",
            totalKg: 10,
            pricePerKg: 50,
            lineTotalKopecks: 1,
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("purchase_line_total_mismatch");
    await app.close();
  });
});
