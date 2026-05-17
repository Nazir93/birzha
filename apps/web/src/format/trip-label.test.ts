import { describe, expect, it } from "vitest";

import { formatTripListStatusLabel, formatTripSelectLabel, formatTripStatusLabel } from "./trip-label.js";

const baseTrip = {
  id: "trip-1",
  tripNumber: "Р-1",
  status: "open",
  vehicleLabel: null,
  driverName: null,
  departedAt: null,
  assignedSellerUserId: null,
} as const;

describe("trip-label", () => {
  it("показывает статусы рейса по-русски", () => {
    expect(formatTripStatusLabel("open")).toBe("Открыт");
    expect(formatTripStatusLabel("closed")).toBe("Закрыт");
  });

  it("в списке: открыт + вся масса продана → «Продан»", () => {
    expect(
      formatTripListStatusLabel({
        ...baseTrip,
        hasShipmentToTrip: true,
        transitRemainingGrams: "0",
      }),
    ).toBe("Продан");
  });

  it("в списке: открыт без полей сводки → «Открыт»", () => {
    expect(formatTripListStatusLabel({ ...baseTrip })).toBe("Открыт");
  });

  it("в списке: закрыт и всё продано → «Закрыт · Продан»", () => {
    expect(
      formatTripListStatusLabel({
        ...baseTrip,
        status: "closed",
        hasShipmentToTrip: true,
        transitRemainingGrams: "0",
      }),
    ).toBe("Закрыт · Продан");
  });

  it("в списке: закрыт с остатком в рейсе → только «Закрыт»", () => {
    expect(
      formatTripListStatusLabel({
        ...baseTrip,
        status: "closed",
        hasShipmentToTrip: true,
        transitRemainingGrams: "5000",
      }),
    ).toBe("Закрыт");
  });

  it("не показывает open в подписи рейса", () => {
    const label = formatTripSelectLabel({
      ...baseTrip,
    });

    expect(label).toContain("(Открыт)");
    expect(label).not.toContain("open");
  });

  it("подпись рейса — «Продан» если сводка полного списка такая", () => {
    const label = formatTripSelectLabel({
      ...baseTrip,
      hasShipmentToTrip: true,
      transitRemainingGrams: "0",
    });
    expect(label).toContain("(Продан)");
  });

  it("добавляет дату выезда для различия рейсов одного водителя", () => {
    const label = formatTripSelectLabel({
      ...baseTrip,
      tripNumber: "М-7",
      vehicleLabel: "А111",
      driverName: "Иванов",
      departedAt: "2026-05-10T08:00:00.000Z",
    });
    expect(label).toContain("10.05.2026");
    expect(label).toContain("Иванов");
    expect(label).not.toContain("trip-1");
  });

  it("по умолчанию без технического id", () => {
    const label = formatTripSelectLabel({ ...baseTrip, tripNumber: "Р-1" });
    expect(label).toBe("Р-1 (Открыт)");
    expect(label).not.toContain("trip-1");
  });

  it("с includeTechnicalId — id в конце (только отладка)", () => {
    const label = formatTripSelectLabel(
      {
        ...baseTrip,
        tripNumber: "Р-12",
        vehicleLabel: "Камаз",
        departedAt: "2026-05-10T08:00:00.000Z",
      },
      { includeTechnicalId: true },
    );
    expect(label).toBe("Р-12 (Открыт) 10.05.2026 Камаз — trip-1");
  });
});
