import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("Accounting receivables HTTP", () => {
  it("продажа в долг → частичные оплаты → закрытие → отказ при переплате", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "acc-b1",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 10,
        distribution: "on_hand",
      },
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "acc-t1", tripNumber: "Ф-ACC" },
    });
    await app.inject({
      method: "POST",
      url: "/batches/acc-b1/ship-to-trip",
      payload: { kg: 50, tripId: "acc-t1" },
    });
    const sell = await app.inject({
      method: "POST",
      url: "/batches/acc-b1/sell-from-trip",
      payload: {
        tripId: "acc-t1",
        kg: 10,
        saleId: "sale-debt-1",
        pricePerKg: 20,
        paymentKind: "debt",
        clientLabel: "ИП Должник",
      },
    });
    expect(sell.statusCode).toBe(200);

    let r = await app.inject({ method: "GET", url: "/accounting/receivables?status=open" });
    expect(r.statusCode).toBe(200);
    let body = JSON.parse(r.body) as {
      receivables: { saleId: string; debtKopecks: string; remainingKopecks: string }[];
    };
    expect(body.receivables).toHaveLength(1);
    expect(body.receivables[0]!.saleId).toBe("sale-debt-1");
    expect(body.receivables[0]!.debtKopecks).toBe("20000");
    expect(body.receivables[0]!.remainingKopecks).toBe("20000");

    r = await app.inject({
      method: "POST",
      url: "/accounting/receivables/sale-debt-1/payments",
      payload: { amountKopecks: 8000, method: "cash", paidAt: "2026-10-01" },
    });
    expect(r.statusCode).toBe(201);
    let pay = JSON.parse(r.body) as { remainingKopecks: string; paidKopecks: string };
    expect(pay.paidKopecks).toBe("8000");
    expect(pay.remainingKopecks).toBe("12000");

    r = await app.inject({
      method: "POST",
      url: "/accounting/receivables/sale-debt-1/payments",
      payload: { amountKopecks: 12000, method: "card", paidAt: "2026-10-02" },
    });
    expect(r.statusCode).toBe(201);
    pay = JSON.parse(r.body) as { remainingKopecks: string };
    expect(pay.remainingKopecks).toBe("0");

    r = await app.inject({ method: "GET", url: "/accounting/receivables?status=closed" });
    body = JSON.parse(r.body) as { receivables: { saleId: string }[] };
    expect(body.receivables.some((x) => x.saleId === "sale-debt-1")).toBe(true);

    r = await app.inject({
      method: "POST",
      url: "/accounting/receivables/sale-debt-1/payments",
      payload: { amountKopecks: 1, method: "cash", paidAt: "2026-10-03" },
    });
    expect(r.statusCode).toBe(409);

    r = await app.inject({ method: "GET", url: "/trips/acc-t1/shipment-report" });
    expect(r.statusCode).toBe(200);
    const report = JSON.parse(r.body) as {
      financials: {
        debtPaidKopecks: string;
        debtOutstandingKopecks: string;
        expensesKopecks: string;
        netProfitKopecks: string;
      };
    };
    expect(report.financials.debtPaidKopecks).toBe("20000");
    expect(report.financials.debtOutstandingKopecks).toBe("0");
    expect(report.financials.expensesKopecks).toBe("0");
    const withRecv = report as typeof report & {
      debtReceivables?: { saleId: string; remainingKopecks: string; status: string }[];
    };
    expect(withRecv.debtReceivables?.some((x) => x.saleId === "sale-debt-1" && x.status === "closed")).toBe(true);

    await app.close();
  });

  it("POST expense и period-summary отдают расходы", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: {
        id: "acc-t-exp",
        tripNumber: "Ф-EXP",
        departedAt: "2026-10-05T08:00:00.000Z",
      },
    });
    let r = await app.inject({
      method: "POST",
      url: "/accounting/trips/acc-t-exp/expenses",
      payload: {
        category: "fuel",
        amountKopecks: 50000,
        expenseDate: "2026-10-05",
        comment: "ДТ",
      },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "GET",
      url: "/accounting/period-summary?from=2026-10-01&to=2026-10-31",
    });
    expect(r.statusCode).toBe(200);
    const summary = JSON.parse(r.body) as { expensesKopecks: string };
    expect(summary.expensesKopecks).toBe("50000");

    await app.inject({
      method: "POST",
      url: "/trips",
      payload: {
        id: "acc-t-msk",
        tripNumber: "Ф-MSK",
        destinationCode: "moscow",
        departedAt: "2026-10-06T08:00:00.000Z",
      },
    });
    await app.inject({
      method: "POST",
      url: "/accounting/trips/acc-t-msk/expenses",
      payload: {
        category: "fuel",
        amountKopecks: 10000,
        expenseDate: "2026-10-06",
      },
    });

    r = await app.inject({
      method: "GET",
      url: "/accounting/period-summary?from=2026-10-01&to=2026-10-31&destinationCode=moscow",
    });
    expect(r.statusCode).toBe(200);
    const scoped = JSON.parse(r.body) as {
      expensesKopecks: string;
      destinationCode: string | null;
      selected: { tripExpensesKopecks: string } | null;
      trips: { tripId: string; tripExpensesKopecks: string }[];
    };
    expect(scoped.destinationCode).toBe("moscow");
    expect(scoped.expensesKopecks).toBe("60000");
    expect(scoped.selected?.tripExpensesKopecks).toBe("10000");
    expect(scoped.trips.some((t) => t.tripId === "acc-t-msk")).toBe(true);
    expect(scoped.trips.every((t) => t.tripId !== "acc-t-exp")).toBe(true);

    r = await app.inject({
      method: "GET",
      url: "/accounting/trip-expenses?from=2026-10-01&to=2026-10-31",
    });
    expect(r.statusCode).toBe(200);
    const tripExp = JSON.parse(r.body) as { totalKopecks: string; expenses: { category: string }[] };
    expect(tripExp.totalKopecks).toBe("60000");
    expect(tripExp.expenses).toHaveLength(2);

    await app.close();
  });

  it("period-summary отделяет аренду от полевых трат продавца", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
    });
    await app.inject({
      method: "POST",
      url: "/trips",
      payload: {
        id: "acc-t-rent",
        tripNumber: "Ф-RENT",
        departedAt: "2026-10-05T08:00:00.000Z",
      },
    });
    let r = await app.inject({
      method: "POST",
      url: "/seller-field-expenses",
      payload: {
        tripId: "acc-t-rent",
        expenseDate: "2026-10-06",
        category: "lunch",
        amountKopecks: 10_000,
      },
    });
    expect(r.statusCode, r.body).toBe(201);
    r = await app.inject({
      method: "POST",
      url: "/seller-field-expenses",
      payload: {
        tripId: "acc-t-rent",
        expenseDate: "2026-10-06",
        category: "rent",
        amountKopecks: 50_000,
      },
    });
    expect(r.statusCode, r.body).toBe(201);

    r = await app.inject({
      method: "GET",
      url: "/accounting/period-summary?from=2026-10-01&to=2026-10-31",
    });
    expect(r.statusCode).toBe(200);
    const summary = JSON.parse(r.body) as {
      sellerFieldExpensesKopecks: string;
      sellerRentExpensesKopecks: string;
      operatingExpensesKopecks: string;
    };
    expect(summary.sellerFieldExpensesKopecks).toBe("10000");
    expect(summary.sellerRentExpensesKopecks).toBe("50000");
    expect(summary.operatingExpensesKopecks).toBe("60000");

    await app.close();
  });

  it("расходы закупщиков и period-summary: тепличники / траты", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
    });

    const created = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      payload: {
        id: "acc-nakl-supplier",
        documentNumber: "НФ-SUP",
        docDate: "2026-10-03",
        warehouseId: "wh-manas",
        supplierName: "Тепличник А",
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            grossKg: 20,
            pricePerKg: 100,
            lineTotalKopecks: 200_000,
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    let r = await app.inject({
      method: "POST",
      url: "/accounting/payables/acc-nakl-supplier/payments",
      payload: { amountKopecks: 80_000, method: "cash", paidAt: "2026-10-04" },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: "/accounting/purchaser-expenses",
      payload: {
        category: "salary",
        amountKopecks: 15_000,
        expenseDate: "2026-10-05",
        purchaserLabel: "Закупщик",
      },
    });
    expect(r.statusCode, r.body).toBe(201);

    r = await app.inject({
      method: "GET",
      url: "/accounting/purchaser-expenses?from=2026-10-01&to=2026-10-31",
    });
    expect(r.statusCode).toBe(200);
    const pe = JSON.parse(r.body) as { totalKopecks: string; salaryKopecks: string };
    expect(pe.totalKopecks).toBe("15000");
    expect(pe.salaryKopecks).toBe("15000");

    r = await app.inject({
      method: "GET",
      url: "/accounting/period-summary?from=2026-10-01&to=2026-10-31",
    });
    expect(r.statusCode).toBe(200);
    const summary = JSON.parse(r.body) as {
      purchaseTotalKopecks: string;
      supplierPaidKopecks: string;
      purchaserExpensesKopecks: string;
      bySupplier: { supplierName: string; purchaseTotalKopecks: string; paidKopecks: string }[];
    };
    expect(summary.purchaseTotalKopecks).toBe("200000");
    expect(summary.supplierPaidKopecks).toBe("80000");
    expect(summary.purchaserExpensesKopecks).toBe("15000");
    const tepl = summary.bySupplier.find((x) => x.supplierName === "Тепличник А");
    expect(tepl?.purchaseTotalKopecks).toBe("200000");
    expect(tepl?.paidKopecks).toBe("80000");

    await app.close();
  });

  it("кредиторка: оплата по закупочной накладной", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
    });

    const created = await app.inject({
      method: "POST",
      url: "/purchase-documents",
      payload: {
        id: "acc-nakl-pay",
        documentNumber: "НФ-PAY",
        docDate: "2026-10-01",
        warehouseId: "wh-manas",
        extraCostKopecks: 0,
        lines: [
          {
            productGradeId: "pg-n5",
            grossKg: 10,
            pricePerKg: 50,
            lineTotalKopecks: 50_000,
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);

    let r = await app.inject({ method: "GET", url: "/accounting/payables?status=open" });
    expect(r.statusCode).toBe(200);
    let body = JSON.parse(r.body) as {
      payables: { documentId: string; remainingKopecks: string; totalKopecks: string }[];
    };
    const row = body.payables.find((p) => p.documentId === "acc-nakl-pay");
    expect(row?.totalKopecks).toBe("50000");
    expect(row?.remainingKopecks).toBe("50000");

    r = await app.inject({
      method: "POST",
      url: "/accounting/payables/acc-nakl-pay/payments",
      payload: { amountKopecks: 20000, method: "bank", paidAt: "2026-10-02" },
    });
    expect(r.statusCode).toBe(201);
    const pay = JSON.parse(r.body) as { paidKopecks: string; remainingKopecks: string };
    expect(pay.paidKopecks).toBe("20000");
    expect(pay.remainingKopecks).toBe("30000");

    r = await app.inject({
      method: "POST",
      url: "/accounting/payables/acc-nakl-pay/payments",
      payload: { amountKopecks: 30000, method: "cash", paidAt: "2026-10-03" },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({ method: "GET", url: "/accounting/payables?status=closed" });
    body = JSON.parse(r.body) as { payables: { documentId: string }[] };
    expect(body.payables.some((p) => p.documentId === "acc-nakl-pay")).toBe(true);

    await app.close();
  });
});
