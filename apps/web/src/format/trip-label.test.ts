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
});
