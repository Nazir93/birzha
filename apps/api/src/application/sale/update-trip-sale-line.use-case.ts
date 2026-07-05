import {
  CounterpartyNotFoundError,
  InsufficientStockForTripError,
  TripNotFoundError,
  TripSaleLineNotFoundError,
  WholesalerNotFoundError,
} from "../errors.js";
import type { AuthRoleGrant } from "../../auth/role-grant.js";
import type { BatchRepository } from "../ports/batch-repository.port.js";
import type { CounterpartyRepository } from "../ports/counterparty-repository.port.js";
import type { TripRepository } from "../ports/trip-repository.port.js";
import type { TripSaleRepository } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentRepository } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageRepository } from "../ports/trip-shortage-repository.port.js";
import type { WholesalerRepository } from "../ports/wholesaler-repository.port.js";
import type { PurchaseLinePackageMetaPort } from "../ports/purchase-line-package-meta.port.js";
import { NullPurchaseLinePackageMetaPort } from "../../infrastructure/persistence/null-purchase-line-package-meta.js";
import { loadBatchForUpdateOrThrow } from "../load-batch.js";
import type { SellFromTripTransactionRunner } from "./sell-from-trip.use-case.js";
import { assertMayEditTripSaleLine, assertTripOpenForSaleEdit } from "./trip-sale-edit-guard.js";
import { resolveSalePaymentSplit } from "./trip-sale-payment.js";
import { assertTripSalePackageCount, availableGramsForTripSaleCorrection } from "./trip-sale-stock.js";
import { gramsToKg, kgToGrams } from "../units/mass.js";
import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../units/rub-kopecks.js";

export type UpdateTripSaleLineInput = {
  lineId: string;
  kg: number;
  pricePerKg: number;
  saleChannel?: "retail" | "wholesale";
  paymentKind?: "cash" | "debt" | "mixed" | "card_transfer";
  cashKopecksMixed?: bigint;
  cardTransferKopecks?: bigint;
  clientLabel?: string | null;
  counterpartyId?: string | null;
  wholesaleBuyerId?: string | null;
  packageCount?: number;
  editorUserId?: string | null;
  editorRoles?: AuthRoleGrant[];
};

export class UpdateTripSaleLineUseCase {
  constructor(
    private readonly batches: BatchRepository,
    private readonly trips: TripRepository,
    private readonly shipments: TripShipmentRepository,
    private readonly sales: TripSaleRepository,
    private readonly shortages: TripShortageRepository,
    private readonly counterparties: CounterpartyRepository,
    private readonly wholesalers: WholesalerRepository,
    private readonly purchasePackages: PurchaseLinePackageMetaPort = new NullPurchaseLinePackageMetaPort(),
    private readonly runInTransaction?: SellFromTripTransactionRunner,
  ) {}

  private async resolveClientSnapshot(
    input: UpdateTripSaleLineInput,
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
      return { clientLabel: w.name.trim() || null, counterpartyId: null, wholesaleBuyerId: w.id };
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

  async execute(input: UpdateTripSaleLineInput): Promise<void> {
    const line = await this.sales.findLineById(input.lineId);
    if (!line) {
      throw new TripSaleLineNotFoundError(input.lineId);
    }

    const trip = await this.trips.findById(line.tripId);
    if (!trip) {
      throw new TripNotFoundError(line.tripId);
    }
    assertTripOpenForSaleEdit(trip, line.tripId);
    assertMayEditTripSaleLine({
      trip,
      line,
      editorUserId: input.editorUserId ?? undefined,
      editorRoles: input.editorRoles,
    });

    const newGrams = kgToGrams(input.kg);
    const shipped = await this.shipments.totalGramsForTripAndBatch(line.tripId, line.batchId);
    const soldIncluding = await this.sales.totalGramsForTripAndBatch(line.tripId, line.batchId);
    const shortage = await this.shortages.totalGramsForTripAndBatch(line.tripId, line.batchId);
    const available = availableGramsForTripSaleCorrection({
      shippedGrams: shipped,
      soldGramsIncludingLine: soldIncluding,
      shortageGrams: shortage,
      lineGrams: line.grams,
    });
    if (newGrams > available) {
      throw new InsufficientStockForTripError(line.tripId, line.batchId, available, newGrams);
    }

    const shipmentAgg = await this.shipments.aggregateByTripId(line.tripId);
    const shipLine = shipmentAgg.byBatch.find((l) => l.batchId === line.batchId);
    const salesAgg = await this.sales.aggregateByTripId(line.tripId);
    const soldPkgIncluding =
      salesAgg.byBatch.find((l) => l.batchId === line.batchId)?.packageCount ?? 0n;
    const nakladnaya = await this.purchasePackages.findByBatchId(line.batchId);
    const salePackageCount = assertTripSalePackageCount({
      shippedGrams: shipLine?.grams ?? 0n,
      shippedPackages: shipLine?.packageCount ?? 0n,
      nakladnaya,
      soldGramsIncludingLine: soldIncluding,
      soldPackagesIncludingLine: soldPkgIncluding,
      shortageGrams: shortage,
      lineGrams: line.grams,
      linePackageCount: line.packageCount ?? 0n,
      packageCount: input.packageCount,
    });

    const pricePerKgKopecks = rubPerKgToKopecksPerKg(input.pricePerKg);
    const revenueKopecks = revenueKopecksFromGramsAndPricePerKg(newGrams, pricePerKgKopecks);
    const { cashKopecks, debtKopecks, cardTransferKopecks } = resolveSalePaymentSplit(
      revenueKopecks,
      input.paymentKind,
      input.cashKopecksMixed,
      input.cardTransferKopecks,
    );

    const saleChannel: "retail" | "wholesale" = input.saleChannel === "wholesale" ? "wholesale" : "retail";
    const { clientLabel, counterpartyId, wholesaleBuyerId } = await this.resolveClientSnapshot(input, saleChannel);

    const previousKg = gramsToKg(line.grams);
    const updated = {
      ...line,
      grams: newGrams,
      pricePerKgKopecks,
      revenueKopecks,
      cashKopecks,
      debtKopecks,
      cardTransferKopecks,
      saleChannel,
      clientLabel,
      counterpartyId,
      wholesaleBuyerId,
      packageCount: salePackageCount,
    };

    const persist = async (ctx: {
      batches: BatchRepository;
      sales: TripSaleRepository;
      shipments: TripShipmentRepository;
      shortages: TripShortageRepository;
    }) => {
      const shippedLocked = await ctx.shipments.totalGramsForTripAndBatch(line.tripId, line.batchId);
      const soldIncludingLocked = await ctx.sales.totalGramsForTripAndBatch(line.tripId, line.batchId);
      const shortageLocked = await ctx.shortages.totalGramsForTripAndBatch(line.tripId, line.batchId);
      const availableLocked = availableGramsForTripSaleCorrection({
        shippedGrams: shippedLocked,
        soldGramsIncludingLine: soldIncludingLocked,
        shortageGrams: shortageLocked,
        lineGrams: line.grams,
      });
      if (newGrams > availableLocked) {
        throw new InsufficientStockForTripError(line.tripId, line.batchId, availableLocked, newGrams);
      }

      const batch = await loadBatchForUpdateOrThrow(ctx.batches, line.batchId);
      batch.adjustTripSaleKg(previousKg, input.kg);
      await ctx.batches.save(batch);
      await ctx.sales.updateLine(updated);
    };

    if (this.runInTransaction) {
      await this.runInTransaction(async (txCtx) => {
        await persist(txCtx);
      });
    } else {
      await persist({
        batches: this.batches,
        sales: this.sales,
        shipments: this.shipments,
        shortages: this.shortages,
      });
    }
  }
}
