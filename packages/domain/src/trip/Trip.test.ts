import { describe, expect, it } from "vitest";

import { Trip } from "./Trip.js";

describe("Trip", () => {
  it("создаётся открытым", () => {
    const t = Trip.create({ id: "t-1", tripNumber: "Ф-01" });
    expect(t.getStatus()).toBe("open");
    expect(t.canAcceptShipments()).toBe(true);
  });

  it("после close не принимает отгрузки", () => {
    const t = Trip.create({ id: "t-2", tripNumber: "Ф-02" });
    t.close();
    expect(t.getStatus()).toBe("closed");
    expect(t.canAcceptShipments()).toBe(false);
  });

  it("restore восстанавливает статус", () => {
    const t = Trip.restore({
      id: "t-3",
      tripNumber: "Ф-03",
      status: "closed",
    });
    expect(t.canAcceptShipments()).toBe(false);
  });

  it("создаётся с ТС, водителем и временем", () => {
    const d = new Date("2026-04-21T10:00:00.000Z");
    const t = Trip.create({
      id: "t-4",
      tripNumber: "Ф-99",
      vehicleLabel: "А 123 ВС 77",
      driverName: "Иванов",
      departedAt: d,
    });
    expect(t.getVehicleLabel()).toBe("А 123 ВС 77");
    expect(t.getDriverName()).toBe("Иванов");
    expect(t.getDepartedAt()?.getTime()).toBe(d.getTime());
  });

  it("хранит назначенного продавца", () => {
    const t = Trip.create({
      id: "t-5",
      tripNumber: "Ф-100",
      assignedSellerUserId: "user-sell-1",
    });
    expect(t.getAssignedSellerUserId()).toBe("user-sell-1");
    const r = Trip.restore({
      id: "t-6",
      tripNumber: "Ф-101",
      status: "open",
      assignedSellerUserId: "u2",
    });
    expect(r.getAssignedSellerUserId()).toBe("u2");
  });

  it("назначает продавца после создания рейса", () => {
    const t = Trip.create({ id: "t-7", tripNumber: "Ф-102" });
    t.assignSeller("  seller-1  ");
    expect(t.getAssignedSellerUserId()).toBe("seller-1");
    expect(() => t.assignSeller(" ")).toThrow("assignedSellerUserId");
  });
});
