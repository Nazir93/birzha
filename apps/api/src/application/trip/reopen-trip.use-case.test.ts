import { describe, expect, it } from "vitest";

import { Trip } from "@birzha/domain";

import { TripNotFoundError } from "../errors.js";
import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";

import { ReopenTripUseCase } from "./reopen-trip.use-case.js";

describe("ReopenTripUseCase", () => {
  it("открывает закрытый рейс", async () => {
    const trips = new InMemoryTripRepository();
    const trip = Trip.create({ id: "t-reopen", tripNumber: "01" });
    trip.close();
    await trips.save(trip);

    await new ReopenTripUseCase(trips).execute("t-reopen");

    const opened = await trips.findById("t-reopen");
    expect(opened?.getStatus()).toBe("open");
  });

  it("бросает, если рейса нет", async () => {
    const trips = new InMemoryTripRepository();
    await expect(new ReopenTripUseCase(trips).execute("missing")).rejects.toBeInstanceOf(
      TripNotFoundError,
    );
  });
});
