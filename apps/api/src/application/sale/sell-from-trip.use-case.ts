import { randomUUID } from "node:crypto";

import { CounterpartyNotFoundError, InsufficientStockForTripError, SalePaymentSplitError, TripNotFoundError } from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { CounterpartyRepository } from "../ports/counterparty-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";
import { loadBatchOrThrow } from "../load-batch.js";
import { kgToGrams } from "../units/kg-grams.js";
import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../units/rub-kopecks.js";

export type SellFromTripInput = {
  batchId: string;
  tripId: string;
  kg: number;
  saleId: string;
  /** Цена продажи за кг, рубли (например 120.5). */
  pricePerKg: number;
  /** По умолчанию вся выручка — наличные. */
  paymentKind?: "cash" | "debt" | "mixed";
  /** При `mixed`: сколько копеек выручки — нал (остальное в долг). */
  cashKopecksMixed?: bigint;
  /** Подпись клиента для отчёта по рейсу (произвольная строка). */
  clientLabel?: string | null;
  /** Справочник контрагентов; при указании подпись берётся из справочника. */
  counterpartyId?: string | null;
  /** Id пользователя (JWT `sub`); пишется в продажу для отчёта в разрезе «только мои» у продавца. */
  recordedByUserId?: string | null;
};

export type SellFromTripTransactionRunner = (
  fn: (batches: BatchRepository, sales: TripSaleRepository) => Promise<void>,
) => Promise<void>;

function resolveCashDebt(
  revenueKopecks: bigint,
  paymentKind: "cash" | "debt" | "mixed" | undefined,
  cashKopecksMixed: bigint | undefined,
): { cashKopecks: bigint; debtKopecks: bigint } {
  const kind = paymentKind ?? "cash";
  if (kind === "cash") {
    return { cashKopecks: revenueKopecks, debtKopecks: 0n };
  }
  if (kind === "debt") {
    return { cashKopecks: 0n, debtKopecks: revenueKopecks };
  }
  if (cashKopecksMixed === undefined) {
    throw new SalePaymentSplitError("При paymentKind=mixed укажите cashKopecksMixed");
  }
  if (cashKopecksMixed < 0n || cashKopecksMixed > revenueKopecks) {
    throw new SalePaymentSplitError("cashKopecksMixed должно быть от 0 до выручки по строке включительно");
  }
  return { cashKopecks: cashKopecksMixed, debtKopecks: revenueKopecks - cashKopecksMixed };
}

export class SellFromTripUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly counterparties: CounterpartyRepository,
    private readonly runSellInTransaction?: SellFromTripTransactionRunner,
  ) {}

  private async resolveClientSnapshot(
    input: SellFromTripInput,
  ): Promise<{ clientLabel: string | null; counterpartyId: string | null }> {
    const id = input.counterpartyId?.trim();
    if (id) {
      const c = await this.counterparties.findActiveById(id);
      if (!c) {
        throw new CounterpartyNotFoundError(id);
      }
      return { clientLabel: c.displayName.trim() || null, counterpartyId: c.id };
    }
    return { clientLabel: input.clientLabel?.trim() || null, counterpartyId: null };
  }

  async execute(input: SellFromTripInput): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }

    const shipped = await this.shipments.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const soldBefore = await this.sales.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const shortageBefore = await this.shortages.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const available = shipped - soldBefore - shortageBefore;

    const requested = kgToGrams(input.kg);
    if (requested > available) {
      throw new InsufficientStockForTripError(input.tripId, input.batchId, available, requested);
    }

    const saleLineId = randomUUID();
    const pricePerKgKopecks = rubPerKgToKopecksPerKg(input.pricePerKg);
    const revenueKopecks = revenueKopecksFromGramsAndPricePerKg(requested, pricePerKgKopecks);
    const { cashKopecks, debtKopecks } = resolveCashDebt(
      revenueKopecks,
      input.paymentKind,
      input.cashKopecksMixed,
    );

    const { clientLabel, counterpartyId } = await this.resolveClientSnapshot(input);

    const persist = async (batches: BatchRepository, saleRepo: TripSaleRepository) => {
      const batch = await loadBatchOrThrow(batches, input.batchId);
      batch.sellFromTrip(input.kg, input.saleId);
      await batches.save(batch);
      await saleRepo.append({
        id: saleLineId,
        tripId: input.tripId,
        batchId: input.batchId,
        saleId: input.saleId,
        grams: requested,
        pricePerKgKopecks,
        revenueKopecks,
        cashKopecks,
        debtKopecks,
        clientLabel,
        counterpartyId,
        recordedByUserId: input.recordedByUserId?.trim() || null,
      });
    };

    if (this.runSellInTransaction) {
      await this.runSellInTransaction(persist);
    } else {
      await persist(this.batches, this.sales);
    }
  }
}
