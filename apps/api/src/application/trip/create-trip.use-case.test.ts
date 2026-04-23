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

  it("сохраняет ТС, водителя и время", async () => {
    const trips = new InMemoryTripRepository();
    await new CreateTripUseCase(trips).execute({
      id: "t-2",
      tripNumber: "Ф-99",
      vehicleLabel: "А 1",
      driverName: "Петров",
      departedAt: "2026-04-21T10:00:00.000Z",
    });
    const t = await trips.findById("t-2");
    expect(t?.getVehicleLabel()).toBe("А 1");
    expect(t?.getDriverName()).toBe("Петров");
    expect(t?.getDepartedAt()?.toISOString()).toBe("2026-04-21T10:00:00.000Z");
  });
});
