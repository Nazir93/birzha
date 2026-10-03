import { describe, expect, it } from "vitest";

import { Trip } from "@birzha/domain";

import { InMemorySellerMoneySendRepository } from "../testing/in-memory-seller-money-send.repository.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";

import { SellerMoneySendsUseCase } from "./seller-money-sends.use-case.js";

describe("SellerMoneySendsUseCase", () => {
  it("записывает отправку и суммирует за период", async () => {
    const trips = new InMemoryTripRepository();
    await trips.save(Trip.create({ id: "t1", tripNumber: "01" }));
    const sends = new InMemorySellerMoneySendRepository();
    const uc = new SellerMoneySendsUseCase(sends, trips);

    await uc.record({
      tripId: "t1",
      sendDate: new Date("2026-10-05T00:00:00.000Z"),
      amountKopecks: 50_000n,
      recipient: "Касса офиса",
    });

    const listed = await uc.list({ fromYmd: "2026-10-01", toYmd: "2026-10-31" });
    expect(listed.totalKopecks).toBe(50_000n);
    expect(listed.sends).toHaveLength(1);
    expect(listed.sends[0]?.recipient).toBe("Касса офиса");
  });
});
