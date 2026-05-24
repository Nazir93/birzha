import { randomUUID } from "node:crypto";

import {
  CounterpartyNotFoundError,
  InsufficientStockForTripError,
  SalePaymentSplitError,
  TripNotFoundError,
  WholesalerNotFoundError,
} from "../errors.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { CounterpartyRepository } from "../ports/counterparty-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";
import type { WholesalerRepository } from "../ports/wholesaler-repository.port.js";
import type { PurchaseLinePackageMetaPort } from "../ports/purchase-line-package-meta.port.js";
import { NullPurchaseLinePackageMetaPort } from "../../infrastructure/persistence/null-purchase-line-package-meta.js";
import { loadBatchOrThrow } from "../load-batch.js";
import {
  effectiveShippedPackages,
  estimateTripBatchPackagesInTransit,
  tripSaleUsesPackageAccounting,
} from "../trip/trip-package-estimate.js";
import { kgToGrams } from "../units/kg-grams.js";
import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../units/rub-kopecks.js";

export type SellFromTripInput = {
  batchId: string;
  tripId: string;
  kg: number;
  saleId: string;
  /** Цена продажи за кг, рубли (например 120.5). */
  pricePerKg: number;
  /** Розница или опт; по умолчанию розница. */
  saleChannel?: "retail" | "wholesale";
  /** По умолчанию вся выручка — наличные. */
  paymentKind?: "cash" | "debt" | "mixed" | "card_transfer";
  /** При `mixed`: сколько копеек выручки — нал (остальное в долг). */
  cashKopecksMixed?: bigint;
  /** При `card_transfer`: сколько копеек — перевод на карту (остальное выручки — наличными). */
  cardTransferKopecks?: bigint;
  /** Подпись клиента для отчёта по рейсу (произвольная строка). */
  clientLabel?: string | null;
  /** Справочник контрагентов; при указании подпись берётся из справочника. */
  counterpartyId?: string | null;
  /** При `saleChannel=wholesale` — id оптовика из справочника. */
  wholesaleBuyerId?: string | null;
  /** Id пользователя (JWT `sub`); пишется в продажу для отчёта в разрезе «только мои» у продавца. */
  recordedByUserId?: string | null;
  /** Ящики в этой продаже (если в отгрузке учитывались ящики). */
  packageCount?: number;
};

export type SellFromTripTransactionRunner = (
  fn: (batches: BatchRepository, sales: TripSaleRepository) => Promise<void>,
) => Promise<void>;

function resolveCashDebtCard(
  revenueKopecks: bigint,
  paymentKind: "cash" | "debt" | "mixed" | "card_transfer" | undefined,
  cashKopecksMixed: bigint | undefined,
  cardTransferKopecksInput: bigint | undefined,
): { cashKopecks: bigint; debtKopecks: bigint; cardTransferKopecks: bigint } {
  const kind = paymentKind ?? "cash";
  if (kind === "cash") {
    return { cashKopecks: revenueKopecks, debtKopecks: 0n, cardTransferKopecks: 0n };
  }
  if (kind === "debt") {
    return { cashKopecks: 0n, debtKopecks: revenueKopecks, cardTransferKopecks: 0n };
  }
  if (kind === "mixed") {
    if (cashKopecksMixed === undefined) {
      throw new SalePaymentSplitError("При paymentKind=mixed укажите cashKopecksMixed");
    }
    if (cashKopecksMixed < 0n || cashKopecksMixed > revenueKopecks) {
      throw new SalePaymentSplitError("cashKopecksMixed должно быть от 0 до выручки по строке включительно");
    }
    return {
      cashKopecks: cashKopecksMixed,
      debtKopecks: revenueKopecks - cashKopecksMixed,
      cardTransferKopecks: 0n,
    };
  }
  if (kind === "card_transfer") {
    if (cardTransferKopecksInput === undefined) {
      throw new SalePaymentSplitError("При paymentKind=card_transfer укажите cardTransferKopecks");
    }
    if (cardTransferKopecksInput < 0n || cardTransferKopecksInput > revenueKopecks) {
      throw new SalePaymentSplitError("cardTransferKopecks должно быть от 0 до выручки по строке включительно");
    }
    return {
      cashKopecks: revenueKopecks - cardTransferKopecksInput,
      debtKopecks: 0n,
      cardTransferKopecks: cardTransferKopecksInput,
    };
  }
  return { cashKopecks: revenueKopecks, debtKopecks: 0n, cardTransferKopecks: 0n };
}

export class SellFromTripUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly counterparties: CounterpartyRepository,
    private readonly wholesalers: WholesalerRepository,
    private readonly purchasePackages: PurchaseLinePackageMetaPort = new NullPurchaseLinePackageMetaPort(),
    private readonly runSellInTransaction?: SellFromTripTransactionRunner,
  ) {}

  private async resolveClientSnapshot(
    input: SellFromTripInput,
    saleChannel: "retail" | "wholesale",
  ): Promise<{ clientLabel: string | null; counterpartyId: string | null; wholesaleBuyerId: string | null }> {
    if (saleChannel === "wholesale") {
      const wid = input.wholesaleBuyerId?.trim();
      if (!wid) {
        throw new WholesalerNotFoundError("(required)");
      }
      const w = await this.wholesalers.findActiveById(wid);
      if (!w) {
        throw new WholesalerNotFoundError(wid);
      }
      const name = w.name.trim() || null;
      return { clientLabel: name, counterpartyId: null, wholesaleBuyerId: w.id };
    }

    const id = input.counterpartyId?.trim();
    if (id) {
      const c = await this.counterparties.findActiveById(id);
      if (!c) {
        throw new CounterpartyNotFoundError(id);
      }
      return { clientLabel: c.displayName.trim() || null, counterpartyId: c.id, wholesaleBuyerId: null };
    }
    return { clientLabel: input.clientLabel?.trim() || null, counterpartyId: null, wholesaleBuyerId: null };
  }

  async execute(input: SellFromTripInput): Promise<void> {
    const trip = await this.trips.findById(input.tripId);
    if (!trip) {
      throw new TripNotFoundError(input.tripId);
    }

    const shipped = await this.shipments.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const soldBefore = await this.sales.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const shortageBefore = await this.shortages.totalGramsForTripAndBatch(input.tripId, input.batchId);
    const salesAgg = await this.sales.aggregateByTripId(input.tripId);
    const soldPkgBefore =
      salesAgg.byBatch.find((l) => l.batchId === input.batchId)?.packageCount ?? 0n;
    const available = shipped - soldBefore - shortageBefore;

    const requested = kgToGrams(input.kg);
    if (requested > available) {
      throw new InsufficientStockForTripError(input.tripId, input.batchId, available, requested);
    }

    const shipmentAgg = await this.shipments.aggregateByTripId(input.tripId);
    const shipLine = shipmentAgg.byBatch.find((l) => l.batchId === input.batchId);
    const shippedG = shipLine?.grams ?? 0n;
    const shippedPackages = shipLine?.packageCount ?? 0n;
    const nakladnaya = await this.purchasePackages.findByBatchId(input.batchId);
    const effectiveShipped = effectiveShippedPackages(shippedG, shippedPackages, nakladnaya);
    const usesPackages = tripSaleUsesPackageAccounting(shippedPackages, nakladnaya);

    let salePackageCount: bigint | null = null;
    if (input.packageCount !== undefined) {
      if (!Number.isFinite(input.packageCount) || input.packageCount < 0) {
        throw new Error("Ящики: укажите целое неотрицательное число");
      }
      salePackageCount = BigInt(Math.floor(input.packageCount));
    }
    if (usesPackages) {
      if (salePackageCount === null) {
        throw new Error("Укажите количество ящиков в продаже");
      }
      if (salePackageCount <= 0n) {
        throw new Error("Количество ящиков должно быть больше нуля");
      }
      const maxPkg = estimateTripBatchPackagesInTransit(
        shippedG,
        effectiveShipped,
        soldBefore,
        shortageBefore,
        soldPkgBefore,
      );
      if (salePackageCount > maxPkg) {
        throw new Error(
          `Не больше ${maxPkg.toString()} ящ. в машине по этой партии (по отгрузке и уже проданному)`,
        );
      }
    } else if (salePackageCount !== null && salePackageCount > 0n) {
      throw new Error("По этой партии в рейсе ящики при отгрузке не указаны — поле ящиков оставьте пустым");
    }

    const saleLineId = randomUUID();
    const pricePerKgKopecks = rubPerKgToKopecksPerKg(input.pricePerKg);
    const revenueKopecks = revenueKopecksFromGramsAndPricePerKg(requested, pricePerKgKopecks);
    const { cashKopecks, debtKopecks, cardTransferKopecks } = resolveCashDebtCard(
      revenueKopecks,
      input.paymentKind,
      input.cashKopecksMixed,
      input.cardTransferKopecks,
    );

    const saleChannel: "retail" | "wholesale" = input.saleChannel === "wholesale" ? "wholesale" : "retail";
    const { clientLabel, counterpartyId, wholesaleBuyerId } = await this.resolveClientSnapshot(input, saleChannel);

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
        cardTransferKopecks,
        saleChannel,
        clientLabel,
        counterpartyId,
        wholesaleBuyerId,
        recordedByUserId: input.recordedByUserId?.trim() || null,
        packageCount: salePackageCount,
      });
    };

    if (this.runSellInTransaction) {
      await this.runSellInTransaction(persist);
    } else {
      await persist(this.batches, this.sales);
    }
  }
}
