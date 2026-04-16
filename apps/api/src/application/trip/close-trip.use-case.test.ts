import { Trip } from "@birzha/domain";
import { describe, expect, it } from "vitest";

import { TripNotFoundError } from "../errors.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { CloseTripUseCase } from "./close-trip.use-case.js";

describe("CloseTripUseCase", () => {
  it("закрывает рейс", async () => {
    const trips = new InMemoryTripRepository();
    await trips.save(Trip.create({ id: "t-1", tripNumber: "Ф-01" }));

    await new CloseTripUseCase(trips).execute("t-1");

    const t = await trips.findById("t-1");
    expect(t?.getStatus()).toBe("closed");
    expect(t?.canAcceptShipments()).toBe(false);
  });

  it("без рейса — TripNotFoundError", async () => {
    const trips = new InMemoryTripRepository();
    await expect(new CloseTripUseCase(trips).execute("missing")).rejects.toThrow(TripNotFoundError);
  });
});
