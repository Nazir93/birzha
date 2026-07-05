import { InsufficientStockError, InvalidKgError } from "./batch.errors.js";
import { gramsToKg, kgToGrams } from "../units/mass.js";

export type BatchDistribution = "awaiting_receipt" | "on_hand";

export type BatchPersistenceState = {
  id: string;
  purchaseId: string;
  totalGrams: bigint;
  pricePerKg: number;
  pendingInboundGrams: bigint;
  onWarehouseGrams: bigint;
  inTransitGrams: bigint;
  soldGrams: bigint;
  writtenOffGrams: bigint;
  warehouseId?: string | null;
};

export class Batch {
  private constructor(
    private readonly id: string,
    private readonly purchaseId: string,
    private readonly totalGrams: bigint,
    private readonly pricePerKg: number,
    private pendingInboundGrams: bigint,
    private onWarehouseGrams: bigint,
    private inTransitGrams: bigint,
    private soldGrams: bigint,
    private writtenOffGrams: bigint,
    private readonly warehouseId: string | null = null,
  ) {}

  static create(config: {
    id: string;
    purchaseId: string;
    totalKg: number;
    pricePerKg: number;
    distribution: BatchDistribution;
    warehouseId?: string | null;
  }): Batch {
    const { id, purchaseId, totalKg, pricePerKg, distribution, warehouseId } = config;
    Batch.assertNonNegativeFinite(totalKg, "totalKg");
    Batch.assertNonNegativeFinite(pricePerKg, "pricePerKg");
    const wh = warehouseId ?? null;
    const total = kgToGrams(totalKg);

    if (distribution === "awaiting_receipt") {
      return new Batch(id, purchaseId, total, pricePerKg, total, 0n, 0n, 0n, 0n, wh);
    }

    return new Batch(id, purchaseId, total, pricePerKg, 0n, total, 0n, 0n, 0n, wh);
  }

  receiveOnWarehouse(kg: number): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.pendingInboundGrams) {
      throw new InsufficientStockError("pending", this.pendingInboundGrams, grams);
    }
    this.pendingInboundGrams -= grams;
    this.onWarehouseGrams += grams;
    this.assertInvariant();
  }

  shipToTrip(kg: number, tripId: string): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.onWarehouseGrams) {
      throw new InsufficientStockError("warehouse", this.onWarehouseGrams, grams);
    }
    void tripId;
    this.onWarehouseGrams -= grams;
    this.inTransitGrams += grams;
    this.assertInvariant();
  }

  sellFromTrip(kg: number, saleId: string): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.inTransitGrams) {
      throw new InsufficientStockError("transit", this.inTransitGrams, grams);
    }
    void saleId;
    this.inTransitGrams -= grams;
    this.soldGrams += grams;
    this.assertInvariant();
  }

  reverseTripSale(kg: number): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.soldGrams) {
      throw new InsufficientStockError("sold", this.soldGrams, grams);
    }
    this.soldGrams -= grams;
    this.inTransitGrams += grams;
    this.assertInvariant();
  }

  adjustTripSaleKg(previousKg: number, newKg: number): void {
    Batch.kgToPositiveGrams(previousKg, "previousKg");
    Batch.kgToPositiveGrams(newKg, "newKg");
    if (previousKg === newKg) {
      return;
    }
    this.reverseTripSale(previousKg);
    this.sellFromTrip(newKg, "correction");
  }

  writeOffFromTransit(kg: number, reason: string): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.inTransitGrams) {
      throw new InsufficientStockError("transit", this.inTransitGrams, grams);
    }
    void reason;
    this.inTransitGrams -= grams;
    this.writtenOffGrams += grams;
    this.assertInvariant();
  }

  receiveBack(kg: number, reason: string): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.inTransitGrams) {
      throw new InsufficientStockError("transit", this.inTransitGrams, grams);
    }
    void reason;
    this.inTransitGrams -= grams;
    this.onWarehouseGrams += grams;
    this.assertInvariant();
  }

  writeOff(kg: number, reason: string): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.onWarehouseGrams) {
      throw new InsufficientStockError("warehouse", this.onWarehouseGrams, grams);
    }
    void reason;
    this.onWarehouseGrams -= grams;
    this.writtenOffGrams += grams;
    this.assertInvariant();
  }

  reverseWarehouseWriteOff(kg: number): void {
    const grams = Batch.kgToPositiveGrams(kg, "kg");
    if (grams > this.writtenOffGrams) {
      throw new InsufficientStockError("written_off", this.writtenOffGrams, grams);
    }
    this.writtenOffGrams -= grams;
    this.onWarehouseGrams += grams;
    this.assertInvariant();
  }

  remainingKg(): number {
    return gramsToKg(this.onWarehouseGrams + this.inTransitGrams);
  }

  totalProcessedKg(): number {
    return gramsToKg(this.soldGrams + this.writtenOffGrams);
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

  getWarehouseId(): string | null {
    return this.warehouseId;
  }

  toPersistenceState(): BatchPersistenceState {
    return {
      id: this.id,
      purchaseId: this.purchaseId,
      totalGrams: this.totalGrams,
      pricePerKg: this.pricePerKg,
      pendingInboundGrams: this.pendingInboundGrams,
      onWarehouseGrams: this.onWarehouseGrams,
      inTransitGrams: this.inTransitGrams,
      soldGrams: this.soldGrams,
      writtenOffGrams: this.writtenOffGrams,
      warehouseId: this.warehouseId,
    };
  }

  static restoreFromPersistence(state: BatchPersistenceState): Batch {
    Batch.assertNonNegativeGrams(state.totalGrams, "totalGrams");
    Batch.assertNonNegativeFinite(state.pricePerKg, "pricePerKg");
    Batch.assertNonNegativeGrams(state.pendingInboundGrams, "pendingInboundGrams");
    Batch.assertNonNegativeGrams(state.onWarehouseGrams, "onWarehouseGrams");
    Batch.assertNonNegativeGrams(state.inTransitGrams, "inTransitGrams");
    Batch.assertNonNegativeGrams(state.soldGrams, "soldGrams");
    Batch.assertNonNegativeGrams(state.writtenOffGrams, "writtenOffGrams");
    const sum =
      state.pendingInboundGrams +
      state.onWarehouseGrams +
      state.inTransitGrams +
      state.soldGrams +
      state.writtenOffGrams;
    if (sum !== state.totalGrams) {
      throw new Error(
        `Неконсистентный снимок партии ${state.id}: сумма частей ${sum.toString()} !== totalGrams ${state.totalGrams.toString()}`,
      );
    }
    return new Batch(
      state.id,
      state.purchaseId,
      state.totalGrams,
      state.pricePerKg,
      state.pendingInboundGrams,
      state.onWarehouseGrams,
      state.inTransitGrams,
      state.soldGrams,
      state.writtenOffGrams,
      state.warehouseId ?? null,
    );
  }

  private assertInvariant(): void {
    const sum =
      this.pendingInboundGrams +
      this.onWarehouseGrams +
      this.inTransitGrams +
      this.soldGrams +
      this.writtenOffGrams;
    if (sum !== this.totalGrams) {
      throw new Error(
        `Нарушен инвариант партии ${this.id}: сумма частей ${sum.toString()} !== totalGrams ${this.totalGrams.toString()}`,
      );
    }
  }

  private static kgToPositiveGrams(kg: number, field: string): bigint {
    Batch.assertPositiveFinite(kg, field);
    const grams = kgToGrams(kg);
    if (grams <= 0n) {
      throw new InvalidKgError(field, kg);
    }
    return grams;
  }

  private static assertNonNegativeGrams(value: bigint, field: string): void {
    if (typeof value !== "bigint" || value < 0n) {
      throw new InvalidKgError(field, value);
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
