import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { kgToGrams } from "../application/units/kg-grams.js";
import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../application/units/rub-kopecks.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

/**
 * Золотой сценарий сходимости по доступным сейчас операциям.
 * Полная цепочка из docs/testing/golden-scenario.md (приёмка с недостачей, долги, возвраты) — позже.
 *
 * Здесь: закупка (партия) → рейс → отгрузка в рейс → недостача при приёмке → продажа с ценой → отчёт и остаток партии.
 */
describe("golden scenario (HTTP flow)", () => {
  it("закупка → рейс → отгрузка → недостача → продажа → сходимость отчёта и партии", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    const tripId = "golden-trip-1";
    const batchId = "golden-batch-1";
    const pricePerKgRub = 1;

    let r = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: tripId, tripNumber: "G-01" },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: batchId,
        purchaseId: "golden-purchase",
        totalKg: 5000,
        pricePerKg: 40,
        distribution: "on_hand",
      },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/ship-to-trip`,
      payload: { kg: 3000, tripId },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/record-trip-shortage`,
      payload: { tripId, kg: 100, reason: "недостача при приёмке" },
    });
    expect(r.statusCode).toBe(200);

    const sellKg = 2900;
    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/sell-from-trip`,
      payload: {
        tripId,
        kg: sellKg,
        saleId: "golden-sale-1",
        pricePerKg: pricePerKgRub,
        paymentKind: "debt",
        clientLabel: "ИП Иванов",
      },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({ method: "GET", url: `/trips/${tripId}/shipment-report` });
    expect(r.statusCode).toBe(200);
    const report = JSON.parse(r.body) as {
      shipment: { totalGrams: string };
      sales: {
        totalGrams: string;
        totalRevenueKopecks: string;
        totalCashKopecks: string;
        totalDebtKopecks: string;
        byClient: { clientLabel: string; grams: string; revenueKopecks: string }[];
      };
      shortage: { totalGrams: string };
      financials: {
        revenueKopecks: string;
        costOfSoldKopecks: string;
        costOfShortageKopecks: string;
        grossProfitKopecks: string;
      };
    };

    expect(report.shipment.totalGrams).toBe("3000000");
    expect(report.shortage.totalGrams).toBe("100000");

    const soldGrams = kgToGrams(sellKg);
    const priceKop = rubPerKgToKopecksPerKg(pricePerKgRub);
    const expectedRevenue = revenueKopecksFromGramsAndPricePerKg(soldGrams, priceKop);
    const purchaseKop = rubPerKgToKopecksPerKg(40);
    const shortageGrams = kgToGrams(100);
    const expectedCostSold = revenueKopecksFromGramsAndPricePerKg(soldGrams, purchaseKop);
    const expectedCostShortage = revenueKopecksFromGramsAndPricePerKg(shortageGrams, purchaseKop);
    const expectedGross = expectedRevenue - expectedCostSold - expectedCostShortage;

    expect(report.sales.totalGrams).toBe(soldGrams.toString());
    expect(report.sales.totalRevenueKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.totalCashKopecks).toBe("0");
    expect(report.sales.totalDebtKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.byClient).toHaveLength(1);
    expect(report.sales.byClient[0].clientLabel).toBe("ИП Иванов");
    expect(report.sales.byClient[0].grams).toBe(soldGrams.toString());
    expect(report.financials.revenueKopecks).toBe(expectedRevenue.toString());
    expect(report.financials.costOfSoldKopecks).toBe(expectedCostSold.toString());
    expect(report.financials.costOfShortageKopecks).toBe(expectedCostShortage.toString());
    expect(report.financials.grossProfitKopecks).toBe(expectedGross.toString());

    const batch = await batches.findById(batchId);
    expect(batch).not.toBeNull();
    expect(batch!.remainingKg()).toBe(2000);
    expect(batch!.totalProcessedKg()).toBe(3000);

    await app.close();
  });

  it("закупка → рейс → отгрузка → недостача → продажа (mixed) → сходимость cash/debt в отчёте", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches });

    const tripId = "golden-trip-mixed";
    const batchId = "golden-batch-mixed";
    const pricePerKgRub = 1;

    let r = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: tripId, tripNumber: "G-MX" },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: batchId,
        purchaseId: "golden-purchase-mx",
        totalKg: 5000,
        pricePerKg: 40,
        distribution: "on_hand",
      },
    });
    expect(r.statusCode).toBe(201);

    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/ship-to-trip`,
      payload: { kg: 3000, tripId },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/record-trip-shortage`,
      payload: { tripId, kg: 100, reason: "недостача при приёмке" },
    });
    expect(r.statusCode).toBe(200);

    const sellKg = 2900;
    const soldGrams = kgToGrams(sellKg);
    const priceKop = rubPerKgToKopecksPerKg(pricePerKgRub);
    const expectedRevenue = revenueKopecksFromGramsAndPricePerKg(soldGrams, priceKop);
    const cashPart = expectedRevenue / 2n;
    const debtPart = expectedRevenue - cashPart;

    r = await app.inject({
      method: "POST",
      url: `/batches/${batchId}/sell-from-trip`,
      payload: {
        tripId,
        kg: sellKg,
        saleId: "golden-sale-mixed-1",
        pricePerKg: pricePerKgRub,
        paymentKind: "mixed",
        cashKopecksMixed: cashPart.toString(),
        clientLabel: "Оптовик",
      },
    });
    expect(r.statusCode).toBe(200);

    r = await app.inject({ method: "GET", url: `/trips/${tripId}/shipment-report` });
    expect(r.statusCode).toBe(200);
    const report = JSON.parse(r.body) as {
      sales: {
        totalGrams: string;
        totalRevenueKopecks: string;
        totalCashKopecks: string;
        totalDebtKopecks: string;
        byClient: { clientLabel: string }[];
      };
      financials: { revenueKopecks: string };
    };

    expect(report.sales.byClient.some((c) => c.clientLabel === "Оптовик")).toBe(true);
    expect(report.sales.totalGrams).toBe(soldGrams.toString());
    expect(report.sales.totalRevenueKopecks).toBe(expectedRevenue.toString());
    expect(report.sales.totalCashKopecks).toBe(cashPart.toString());
    expect(report.sales.totalDebtKopecks).toBe(debtPart.toString());
    expect(report.financials.revenueKopecks).toBe(expectedRevenue.toString());

    await app.close();
  });
});
