import { describe, expect, it } from "vitest";

import { formatTripSelectLabel, formatTripStatusLabel } from "./trip-label.js";

describe("trip-label", () => {
  it("показывает статусы рейса по-русски", () => {
    expect(formatTripStatusLabel("open")).toBe("Открыт");
    expect(formatTripStatusLabel("closed")).toBe("Закрыт");
  });

  it("не показывает open в подписи рейса", () => {
    const label = formatTripSelectLabel({
      id: "trip-1",
      tripNumber: "Р-1",
      status: "open",
      vehicleLabel: null,
      driverName: null,
      departedAt: null,
      assignedSellerUserId: null,
    });

    expect(label).toContain("(Открыт)");
    expect(label).not.toContain("open");
  });

  it("добавляет дату выезда для различия рейсов одного водителя", () => {
    const label = formatTripSelectLabel({
      id: "trip-2",
      tripNumber: "М-7",
      status: "open",
      vehicleLabel: "А111",
      driverName: "Иванов",
      departedAt: "2026-05-10T08:00:00.000Z",
      assignedSellerUserId: null,
    });
    expect(label).toContain("10.05.2026");
    expect(label).toContain("Иванов");
  });
});
