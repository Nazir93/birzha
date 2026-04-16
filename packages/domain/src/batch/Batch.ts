import { InsufficientStockError, InvalidKgError } from "./batch.errors.js";

export type BatchDistribution = "awaiting_receipt" | "on_hand";

export type BatchPersistenceState = {
  id: string;
  purchaseId: string;
  totalKg: number;
  pricePerKg: number;
  pendingInboundKg: number;
  onWarehouseKg: number;
  inTransitKg: number;
  soldKg: number;
  writtenOffKg: number;
};

export class Batch {
  private constructor(
    private readonly id: string,
    private readonly purchaseId: string,
    private readonly totalKg: number,
    private readonly pricePerKg: number,
    private pendingInboundKg: number,
    private onWarehouseKg: number,
    private inTransitKg: number,
    private soldKg: number,
    private writtenOffKg: number,
  ) {}

  static create(config: {
    id: string;
    purchaseId: string;
    totalKg: number;
    pricePerKg: number;
    distribution: BatchDistribution;
  }): Batch {
    const { id, purchaseId, totalKg, pricePerKg, distribution } = config;
    Batch.assertNonNegativeFinite(totalKg, "totalKg");
    Batch.assertNonNegativeFinite(pricePerKg, "pricePerKg");

    if (distribution === "awaiting_receipt") {
      return new Batch(
        id,
        purchaseId,
        totalKg,
        pricePerKg,
        totalKg,
        0,
        0,
        0,
        0,
      );
    }

    return new Batch(id, purchaseId, totalKg, pricePerKg, 0, totalKg, 0, 0, 0);
  }

  receiveOnWarehouse(kg: number): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.pendingInboundKg) {
      throw new InsufficientStockError("pending", this.pendingInboundKg, kg);
    }
    this.pendingInboundKg -= kg;
    this.onWarehouseKg += kg;
    this.assertInvariant();
  }

  shipToTrip(kg: number, tripId: string): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.onWarehouseKg) {
      throw new InsufficientStockError("warehouse", this.onWarehouseKg, kg);
    }
    void tripId;
    this.onWarehouseKg -= kg;
    this.inTransitKg += kg;
    this.assertInvariant();
  }

  sellFromTrip(kg: number, saleId: string): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.inTransitKg) {
      throw new InsufficientStockError("transit", this.inTransitKg, kg);
    }
    void saleId;
    this.inTransitKg -= kg;
    this.soldKg += kg;
    this.assertInvariant();
  }

  /**
   * Недостача / потеря массы в пути (приёмка рейса): списание из рейса в списанное без продажи.
   */
  writeOffFromTransit(kg: number, reason: string): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.inTransitKg) {
      throw new InsufficientStockError("transit", this.inTransitKg, kg);
    }
    void reason;
    this.inTransitKg -= kg;
    this.writtenOffKg += kg;
    this.assertInvariant();
  }

  receiveBack(kg: number, reason: string): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.inTransitKg) {
      throw new InsufficientStockError("transit", this.inTransitKg, kg);
    }
    void reason;
    this.inTransitKg -= kg;
    this.onWarehouseKg += kg;
    this.assertInvariant();
  }

  writeOff(kg: number, reason: string): void {
    Batch.assertPositiveFinite(kg, "kg");
    if (kg > this.onWarehouseKg) {
      throw new InsufficientStockError("warehouse", this.onWarehouseKg, kg);
    }
    void reason;
    this.onWarehouseKg -= kg;
    this.writtenOffKg += kg;
    this.assertInvariant();
  }

  remainingKg(): number {
    return this.onWarehouseKg + this.inTransitKg;
  }

  totalProcessedKg(): number {
    return this.soldKg + this.writtenOffKg;
  }

  getId(): string {
    return this.id;
  }

  getPurchaseId(): string {
    return this.purchaseId;
  }

  getPricePerKg(): number {
    return this.pricePerKg;
  }

  /**
   * Снимок для сохранения в БД (кг — как в домене; инфраструктура переводит в граммы).
   */
  toPersistenceState(): BatchPersistenceState {
    return {
      id: this.id,
      purchaseId: this.purchaseId,
      totalKg: this.totalKg,
      pricePerKg: this.pricePerKg,
      pendingInboundKg: this.pendingInboundKg,
      onWarehouseKg: this.onWarehouseKg,
      inTransitKg: this.inTransitKg,
      soldKg: this.soldKg,
      writtenOffKg: this.writtenOffKg,
    };
  }

  /**
   * Восстановление из БД после проверки инвариантов.
   */
  static restoreFromPersistence(state: BatchPersistenceState): Batch {
    Batch.assertNonNegativeFinite(state.totalKg, "totalKg");
    Batch.assertNonNegativeFinite(state.pricePerKg, "pricePerKg");
    Batch.assertNonNegativeFinite(state.pendingInboundKg, "pendingInboundKg");
    Batch.assertNonNegativeFinite(state.onWarehouseKg, "onWarehouseKg");
    Batch.assertNonNegativeFinite(state.inTransitKg, "inTransitKg");
    Batch.assertNonNegativeFinite(state.soldKg, "soldKg");
    Batch.assertNonNegativeFinite(state.writtenOffKg, "writtenOffKg");
    const sum =
      state.pendingInboundKg +
      state.onWarehouseKg +
      state.inTransitKg +
      state.soldKg +
      state.writtenOffKg;
    if (Math.abs(sum - state.totalKg) > 1e-9) {
      throw new Error(
        `Неконсистентный снимок партии ${state.id}: сумма частей ${sum} !== totalKg ${state.totalKg}`,
      );
    }
    return new Batch(
      state.id,
      state.purchaseId,
      state.totalKg,
      state.pricePerKg,
      state.pendingInboundKg,
      state.onWarehouseKg,
      state.inTransitKg,
      state.soldKg,
      state.writtenOffKg,
    );
  }

  private assertInvariant(): void {
    const sum =
      this.pendingInboundKg +
      this.onWarehouseKg +
      this.inTransitKg +
      this.soldKg +
      this.writtenOffKg;
    if (Math.abs(sum - this.totalKg) > 1e-9) {
      throw new Error(
        `Нарушен инвариант партии ${this.id}: сумма частей ${sum} !== totalKg ${this.totalKg}`,
      );
    }
  }

  private static assertNonNegativeFinite(value: number, field: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new InvalidKgError(field, value);
    }
  }

  private static assertPositiveFinite(value: number, field: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new InvalidKgError(field, value);
    }
  }
}
