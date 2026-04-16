import { describe, expect, it } from "vitest";

import { InMemoryTripRepository } from "../testing/in-memory-trip.repository.js";
import { CreateTripUseCase } from "./create-trip.use-case.js";

describe("CreateTripUseCase", () => {
  it("сохраняет открытый рейс", async () => {
    const trips = new InMemoryTripRepository();
    await new CreateTripUseCase(trips).execute({ id: "t-1", tripNumber: "Ф-01" });
    const t = await trips.findById("t-1");
    expect(t?.canAcceptShipments()).toBe(true);
  });
});
