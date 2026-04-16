import { describe, expect, it } from "vitest";

import { InMemoryBatchRepository } from "../application/testing/in-memory-batch.repository.js";
import { InMemoryTripRepository } from "../application/testing/in-memory-trip.repository.js";
import { buildApp } from "../app.js";
import { loadEnv } from "../config.js";

describe("Trip HTTP", () => {
  it("GET /trips и карточка рейса", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const trips = new InMemoryTripRepository();
    const app = await buildApp({
      env,
      db: null,
      batchRepository: new InMemoryBatchRepository(),
      tripRepository: trips,
    });

    let res = await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "http-t1", tripNumber: "Ф-99" },
    });
    expect(res.statusCode).toBe(201);

    res = await app.inject({ method: "GET", url: "/trips" });
    expect(res.statusCode).toBe(200);
    const listBody = JSON.parse(res.body) as { trips: { id: string }[] };
    expect(listBody.trips.some((t) => t.id === "http-t1")).toBe(true);

    res = await app.inject({ method: "GET", url: "/trips/http-t1" });
    expect(res.statusCode).toBe(200);
    const one = JSON.parse(res.body) as { trip: { tripNumber: string; status: string } };
    expect(one.trip.tripNumber).toBe("Ф-99");
    expect(one.trip.status).toBe("open");

    res = await app.inject({ method: "GET", url: "/trips/http-t1/shipment-report" });
    expect(res.statusCode).toBe(200);
    const rep = JSON.parse(res.body) as {
      shipment: { totalGrams: string };
      sales: {
        totalGrams: string;
        totalRevenueKopecks: string;
        totalCashKopecks: string;
        totalDebtKopecks: string;
      };
      shortage: { totalGrams: string };
      financials: {
        revenueKopecks: string;
        costOfSoldKopecks: string;
        costOfShortageKopecks: string;
        grossProfitKopecks: string;
      };
    };
    expect(rep.shipment.totalGrams).toBe("0");
    expect(rep.sales.totalGrams).toBe("0");
    expect(rep.sales.totalRevenueKopecks).toBe("0");
    expect(rep.sales.totalCashKopecks).toBe("0");
    expect(rep.sales.totalDebtKopecks).toBe("0");
    expect(rep.shortage.totalGrams).toBe("0");
    expect(rep.financials.revenueKopecks).toBe("0");
    expect(rep.financials.costOfSoldKopecks).toBe("0");
    expect(rep.financials.costOfShortageKopecks).toBe("0");
    expect(rep.financials.grossProfitKopecks).toBe("0");

    await app.close();
  });

  it("POST /trips/:id/close — затем отгрузка в рейс даёт 409", async () => {
    const env = loadEnv({ DATABASE_URL: undefined, NODE_ENV: "test" });
    const trips = new InMemoryTripRepository();
    const batches = new InMemoryBatchRepository();
    const app = await buildApp({ env, db: null, batchRepository: batches, tripRepository: trips });

    await app.inject({
      method: "POST",
      url: "/batches",
      payload: {
        id: "b-close",
        purchaseId: "p-1",
        totalKg: 100,
        pricePerKg: 1,
        distribution: "on_hand",
      },
    });

    await app.inject({
      method: "POST",
      url: "/trips",
      payload: { id: "t-closed", tripNumber: "Ф-X" },
    });

    let res = await app.inject({ method: "POST", url: "/trips/t-closed/close", payload: {} });
    expect(res.statusCode).toBe(200);

    res = await app.inject({
      method: "POST",
      url: "/batches/b-close/ship-to-trip",
      payload: { kg: 10, tripId: "t-closed" },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("trip_closed");

    await app.close();
  });
});
