import { describe, expect, it } from "vitest";
import { Batch } from "./Batch.js";
import { InsufficientStockError, InvalidKgError } from "./batch.errors.js";

describe("Batch", () => {
  it("создаёт партию, полностью ожидающую поступления", () => {
    const batch = Batch.create({
      id: "b-1",
      purchaseId: "p-1",
      totalKg: 1000,
      pricePerKg: 10,
      distribution: "awaiting_receipt",
    });
    expect(batch.remainingKg()).toBe(0);
  });

  it("создаёт партию, полностью на складе", () => {
    const batch = Batch.create({
      id: "b-2",
      purchaseId: "p-2",
      totalKg: 500,
      pricePerKg: 12,
      distribution: "on_hand",
    });
    expect(batch.getId()).toBe("b-2");
    expect(batch.remainingKg()).toBe(500);
  });

  it("receiveOnWarehouse переносит кг из ожидания на склад", () => {
    const batch = Batch.create({
      id: "b-3",
      purchaseId: "p-3",
      totalKg: 800,
      pricePerKg: 9,
      distribution: "awaiting_receipt",
    });
    batch.receiveOnWarehouse(300);
    expect(batch.remainingKg()).toBe(300);
  });

  it("shipToTrip уменьшает склад и увеличивает рейс", () => {
    const batch = Batch.create({
      id: "b-4",
      purchaseId: "p-4",
      totalKg: 600,
      pricePerKg: 11,
      distribution: "on_hand",
    });
    batch.shipToTrip(200, "t-1");
    expect(batch.remainingKg()).toBe(600);
  });

  it("sellFromTrip продаёт только из рейса", () => {
    const batch = Batch.create({
      id: "b-5",
      purchaseId: "p-5",
      totalKg: 400,
      pricePerKg: 8,
      distribution: "on_hand",
    });
    batch.shipToTrip(150, "t-2");
    batch.sellFromTrip(100, "s-1");
    expect(batch.remainingKg()).toBe(300);
    expect(batch.totalProcessedKg()).toBe(100);
  });

  it("выбрасывает при отгрузке больше, чем на складе", () => {
    const batch = Batch.create({
      id: "b-6",
      purchaseId: "p-6",
      totalKg: 100,
      pricePerKg: 5,
      distribution: "on_hand",
    });
    expect(() => batch.shipToTrip(200, "t-3")).toThrow(InsufficientStockError);
  });

  it("receiveBack возвращает товар со рейса на склад", () => {
    const batch = Batch.create({
      id: "b-7",
      purchaseId: "p-7",
      totalKg: 300,
      pricePerKg: 7,
      distribution: "on_hand",
    });
    batch.shipToTrip(120, "t-4");
    batch.receiveBack(40, "брак упаковки");
    expect(batch.remainingKg()).toBe(300);
  });

  it("writeOff списывает со склада", () => {
    const batch = Batch.create({
      id: "b-8",
      purchaseId: "p-8",
      totalKg: 200,
      pricePerKg: 6,
      distribution: "on_hand",
    });
    batch.writeOff(50, "порча");
    expect(batch.remainingKg()).toBe(150);
    expect(batch.totalProcessedKg()).toBe(50);
  });

  it("writeOffFromTransit списывает недостачу из рейса", () => {
    const batch = Batch.create({
      id: "b-8b",
      purchaseId: "p-8",
      totalKg: 500,
      pricePerKg: 6,
      distribution: "on_hand",
    });
    batch.shipToTrip(200, "t-8");
    batch.writeOffFromTransit(30, "недостача при приёмке");
    expect(batch.remainingKg()).toBe(500 - 30);
    expect(batch.totalProcessedKg()).toBe(30);
  });

  it("restoreFromPersistence восстанавливает то же поведение", () => {
    const created = Batch.create({
      id: "b-10",
      purchaseId: "p-10",
      totalKg: 100,
      pricePerKg: 5,
      distribution: "on_hand",
    });
    const restored = Batch.restoreFromPersistence(created.toPersistenceState());
    expect(restored.getId()).toBe(created.getId());
    expect(restored.remainingKg()).toBe(created.remainingKg());
  });

  it("отклоняет отрицательные и нулевые кг", () => {
    const batch = Batch.create({
      id: "b-9",
      purchaseId: "p-9",
      totalKg: 50,
      pricePerKg: 4,
      distribution: "on_hand",
    });
    expect(() => batch.shipToTrip(0, "t-5")).toThrow(InvalidKgError);
  });
});
