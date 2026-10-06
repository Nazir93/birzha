import { Obligation } from "@birzha/domain";
import type { Trip } from "@birzha/domain";

import { loadBatchOrThrow } from "../application/load-batch.js";
import type { BatchRepository } from "../application/ports/batch-repository.port.js";
import type { DebtPaymentRepository } from "../application/ports/debt-payment-repository.port.js";
import type { PurchaseDocumentRepository } from "../application/ports/purchase-document-repository.port.js";
import type { PurchaserExpenseRepository } from "../application/ports/purchaser-expense-repository.port.js";
import type { SellerFieldExpenseRepository } from "../application/ports/seller-field-expense-repository.port.js";
import type { SellerMoneySendRepository } from "../application/ports/seller-money-send-repository.port.js";
import type { SupplierPaymentRepository } from "../application/ports/supplier-payment-repository.port.js";
import type { TripExpenseRepository } from "../application/ports/trip-expense-repository.port.js";
import type { TripRepository } from "../application/ports/trip-repository.port.js";
import type { TripSaleRepository } from "../application/ports/trip-sale-repository.port.js";
import type { TripShortageRepository } from "../application/ports/trip-shortage-repository.port.js";
import { computeTripFinancials } from "../application/trip/trip-financials.js";

function inPeriod(ymd: string, fromYmd: string, toYmd: string): boolean {
  return ymd >= fromYmd && ymd <= toYmd;
}

function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SupplierAgg = {
  supplierKey: string;
  supplierName: string;
  purchaseTotal: bigint;
  paidInPeriod: bigint;
  remaining: bigint;
};

export type AccountingPeriodSummaryScope = {
  destinationCode?: string;
  tripId?: string;
};

/** Фильтр рейсов периода по региону (направление) и/или id рейса. */
export function filterTripsForAccountingScope(
  trips: readonly Trip[],
  scope: AccountingPeriodSummaryScope,
): Trip[] {
  const dest = scope.destinationCode?.trim() ?? "";
  const tripId = scope.tripId?.trim() ?? "";
  return trips.filter((t) => {
    if (tripId && t.getId() !== tripId) {
      return false;
    }
    if (dest) {
      const code = (t.getDestinationCode() ?? "").trim();
      if (code !== dest) {
        return false;
      }
    }
    return true;
  });
}

export function hasAccountingPeriodScope(scope: AccountingPeriodSummaryScope): boolean {
  return Boolean(scope.destinationCode?.trim() || scope.tripId?.trim());
}

type TripMoneySlice = {
  tripId: string;
  tripNumber: string;
  destinationCode: string | null;
  departedYmd: string | null;
  status: string;
  revenueCash: bigint;
  revenueCard: bigint;
  revenueDebt: bigint;
  costSold: bigint;
  costShortage: bigint;
  grossProfit: bigint;
  tripExpenses: bigint;
  sellerFieldWithoutRent: bigint;
  sellerRent: bigint;
  sellerMoneySends: bigint;
  debtPaid: bigint;
  debtOutstanding: bigint;
};

function emptySliceTotals() {
  return {
    revenueCash: 0n,
    revenueCard: 0n,
    revenueDebt: 0n,
    costSold: 0n,
    costShortage: 0n,
    grossProfit: 0n,
    tripExpenses: 0n,
    sellerFieldWithoutRent: 0n,
    sellerRent: 0n,
    sellerMoneySends: 0n,
    debtPaid: 0n,
    debtOutstanding: 0n,
    purchaserExpenses: 0n,
    purchaseTotal: 0n,
    supplierPaid: 0n,
    receivablesOutstanding: 0n,
    payablesOutstanding: 0n,
  };
}

function sliceToSummaryJson(
  fromYmd: string,
  toYmd: string,
  t: ReturnType<typeof emptySliceTotals>,
  bySupplier: Array<{
    supplierKey: string;
    supplierName: string;
    purchaseTotalKopecks: string;
    paidKopecks: string;
    remainingKopecks: string;
  }>,
) {
  const operating =
    t.tripExpenses + t.sellerFieldWithoutRent + t.sellerRent + t.purchaserExpenses + t.sellerMoneySends;
  return {
    from: fromYmd,
    to: toYmd,
    revenueCashKopecks: t.revenueCash.toString(),
    revenueCardKopecks: t.revenueCard.toString(),
    revenueDebtKopecks: t.revenueDebt.toString(),
    revenueTotalKopecks: (t.revenueCash + t.revenueCard + t.revenueDebt).toString(),
    debtPaidKopecks: t.debtPaid.toString(),
    costOfSoldKopecks: t.costSold.toString(),
    costOfShortageKopecks: t.costShortage.toString(),
    grossProfitKopecks: t.grossProfit.toString(),
    expensesKopecks: t.tripExpenses.toString(),
    tripExpensesKopecks: t.tripExpenses.toString(),
    sellerFieldExpensesKopecks: t.sellerFieldWithoutRent.toString(),
    sellerRentExpensesKopecks: t.sellerRent.toString(),
    purchaserExpensesKopecks: t.purchaserExpenses.toString(),
    sellerMoneySendsKopecks: t.sellerMoneySends.toString(),
    operatingExpensesKopecks: operating.toString(),
    netProfitKopecks: (t.grossProfit - operating).toString(),
    purchaseTotalKopecks: t.purchaseTotal.toString(),
    supplierPaidKopecks: t.supplierPaid.toString(),
    receivablesOutstandingKopecks: t.receivablesOutstanding.toString(),
    payablesOutstandingKopecks: t.payablesOutstanding.toString(),
    bySupplier,
  };
}

function tripRowToJson(row: TripMoneySlice) {
  const operating = row.tripExpenses + row.sellerFieldWithoutRent + row.sellerRent + row.sellerMoneySends;
  return {
    tripId: row.tripId,
    tripNumber: row.tripNumber,
    destinationCode: row.destinationCode,
    departedAt: row.departedYmd,
    status: row.status,
    revenueCashKopecks: row.revenueCash.toString(),
    revenueCardKopecks: row.revenueCard.toString(),
    revenueDebtKopecks: row.revenueDebt.toString(),
    revenueTotalKopecks: (row.revenueCash + row.revenueCard + row.revenueDebt).toString(),
    costOfSoldKopecks: row.costSold.toString(),
    costOfShortageKopecks: row.costShortage.toString(),
    grossProfitKopecks: row.grossProfit.toString(),
    tripExpensesKopecks: row.tripExpenses.toString(),
    sellerFieldExpensesKopecks: row.sellerFieldWithoutRent.toString(),
    sellerRentExpensesKopecks: row.sellerRent.toString(),
    sellerMoneySendsKopecks: row.sellerMoneySends.toString(),
    debtPaidKopecks: row.debtPaid.toString(),
    debtOutstandingKopecks: row.debtOutstanding.toString(),
    netProfitKopecks: (row.grossProfit - operating).toString(),
  };
}

/**
 * Сводка за период для кабинета бухгалтера / кассира.
 * Продажи/себестоимость — по дате выезда рейса; расходы и оплаты — по своей дате.
 * Опционально: `destinationCode` / `tripId` — блок `selected` + `trips` (детализация).
 */
export async function buildAccountingPeriodSummary(deps: {
  fromYmd: string;
  toYmd: string;
  destinationCode?: string;
  tripId?: string;
  sales: TripSaleRepository;
  trips: TripRepository;
  debtPayments: DebtPaymentRepository;
  purchaseDocuments: PurchaseDocumentRepository | null;
  supplierPayments: SupplierPaymentRepository | null;
  tripExpenses: TripExpenseRepository | null;
  sellerFieldExpenses: SellerFieldExpenseRepository | null;
  purchaserExpenses: PurchaserExpenseRepository | null;
  sellerMoneySends: SellerMoneySendRepository | null;
  shipments: unknown;
  shortages: TripShortageRepository | null;
  batches: BatchRepository | null;
}) {
  const { fromYmd, toYmd } = deps;
  const scope: AccountingPeriodSummaryScope = {
    destinationCode: deps.destinationCode,
    tripId: deps.tripId,
  };
  const allTrips = await deps.trips.list({ limit: 500, offset: 0, order: "departedAtDesc" });
  const periodTrips = allTrips.filter((trip) => {
    const departed = trip.getDepartedAt();
    const day = departed ? ymdUtc(departed) : null;
    return Boolean(day && inPeriod(day, fromYmd, toYmd));
  });
  const scopedTrips = hasAccountingPeriodScope(scope)
    ? filterTripsForAccountingScope(periodTrips, scope)
    : [];

  async function buildTripRows(trips: Trip[]): Promise<TripMoneySlice[]> {
    const rows: TripMoneySlice[] = [];
    for (const trip of trips) {
      const tripId = trip.getId();
      const departed = trip.getDepartedAt();
      const day = departed ? ymdUtc(departed) : null;
      const sales = await deps.sales.aggregateByTripId(tripId);
      const shortage =
        deps.shortages != null
          ? await deps.shortages.aggregateByTripId(tripId)
          : { totalGrams: 0n, totalPackageCount: 0n, byBatch: [] };
      const purchaseMap = new Map<string, number>();
      if (deps.batches) {
        const ids = new Set<string>();
        for (const l of sales.byBatch) {
          ids.add(l.batchId);
        }
        for (const l of shortage.byBatch) {
          ids.add(l.batchId);
        }
        for (const id of ids) {
          const b = await loadBatchOrThrow(deps.batches, id);
          purchaseMap.set(id, b.getPricePerKg());
        }
      }
      const fin = computeTripFinancials(sales, shortage, purchaseMap);

      let tripExpenses = 0n;
      if (deps.tripExpenses) {
        const expRows = await deps.tripExpenses.listByTripId(tripId);
        for (const e of expRows) {
          if (inPeriod(ymdUtc(e.expenseDate), fromYmd, toYmd)) {
            tripExpenses += e.amountKopecks;
          }
        }
      }

      let sellerField = 0n;
      let sellerRent = 0n;
      if (deps.sellerFieldExpenses) {
        const fieldRows = await deps.sellerFieldExpenses.list({ tripId, fromYmd, toYmd });
        for (const e of fieldRows) {
          sellerField += e.amountKopecks;
          if (e.category === "rent") {
            sellerRent += e.amountKopecks;
          }
        }
      }

      let sellerMoneySends = 0n;
      if (deps.sellerMoneySends) {
        const sends = await deps.sellerMoneySends.list({ tripId, fromYmd, toYmd });
        for (const s of sends) {
          sellerMoneySends += s.amountKopecks;
        }
      }

      const debtGroups = await deps.sales.listDebtGroups({ tripId });
      let debtPaid = 0n;
      let debtOutstanding = 0n;
      for (const g of debtGroups) {
        const pays = await deps.debtPayments.listBySaleId(g.saleId);
        let paidInPeriod = 0n;
        let paidToDate = 0n;
        for (const p of pays) {
          const pd = ymdUtc(p.paidAt);
          if (inPeriod(pd, fromYmd, toYmd)) {
            paidInPeriod += p.amountKopecks;
          }
          if (pd <= toYmd) {
            paidToDate += p.amountKopecks;
          }
        }
        debtPaid += paidInPeriod;
        if (ymdUtc(g.firstRecordedAt) <= toYmd) {
          debtOutstanding += Obligation.restore({
            debtKopecks: g.debtKopecks,
            paidKopecks: paidToDate,
          }).remainingKopecks();
        }
      }

      rows.push({
        tripId,
        tripNumber: trip.getTripNumber(),
        destinationCode: trip.getDestinationCode(),
        departedYmd: day,
        status: trip.getStatus(),
        revenueCash: sales.totalCashKopecks,
        revenueCard: sales.totalCardTransferKopecks,
        revenueDebt: sales.totalDebtKopecks,
        costSold: fin.costOfSoldKopecks,
        costShortage: fin.costOfShortageKopecks,
        grossProfit: fin.grossProfitKopecks,
        tripExpenses,
        sellerFieldWithoutRent: sellerField - sellerRent,
        sellerRent,
        sellerMoneySends,
        debtPaid,
        debtOutstanding,
      });
    }
    return rows;
  }

  const overallTripRows = await buildTripRows(periodTrips);
  const overall = emptySliceTotals();
  for (const row of overallTripRows) {
    overall.revenueCash += row.revenueCash;
    overall.revenueCard += row.revenueCard;
    overall.revenueDebt += row.revenueDebt;
    overall.costSold += row.costSold;
    overall.costShortage += row.costShortage;
    overall.grossProfit += row.grossProfit;
    overall.tripExpenses += row.tripExpenses;
    overall.sellerFieldWithoutRent += row.sellerFieldWithoutRent;
    overall.sellerRent += row.sellerRent;
    overall.sellerMoneySends += row.sellerMoneySends;
    overall.debtPaid += row.debtPaid;
    overall.debtOutstanding += row.debtOutstanding;
  }

  if (deps.sellerFieldExpenses) {
    const allField = await deps.sellerFieldExpenses.list({ fromYmd, toYmd });
    let fieldAll = 0n;
    let rentAll = 0n;
    for (const e of allField) {
      fieldAll += e.amountKopecks;
      if (e.category === "rent") {
        rentAll += e.amountKopecks;
      }
    }
    overall.sellerFieldWithoutRent = fieldAll - rentAll;
    overall.sellerRent = rentAll;
  }

  if (deps.sellerMoneySends) {
    overall.sellerMoneySends = await deps.sellerMoneySends.sumInPeriod(fromYmd, toYmd);
  }

  if (deps.purchaserExpenses) {
    overall.purchaserExpenses = await deps.purchaserExpenses.sumInPeriod(fromYmd, toYmd);
  }

  const debtGroupsAll = await deps.sales.listDebtGroups();
  let debtPaidInPeriodAll = 0n;
  let receivablesOutstanding = 0n;
  for (const g of debtGroupsAll) {
    const pays = await deps.debtPayments.listBySaleId(g.saleId);
    let paidToDate = 0n;
    for (const p of pays) {
      const pd = ymdUtc(p.paidAt);
      if (inPeriod(pd, fromYmd, toYmd)) {
        debtPaidInPeriodAll += p.amountKopecks;
      }
      if (pd <= toYmd) {
        paidToDate += p.amountKopecks;
      }
    }
    if (ymdUtc(g.firstRecordedAt) <= toYmd) {
      receivablesOutstanding += Obligation.restore({
        debtKopecks: g.debtKopecks,
        paidKopecks: paidToDate,
      }).remainingKopecks();
    }
  }
  overall.debtPaid = debtPaidInPeriodAll;
  overall.receivablesOutstanding = receivablesOutstanding;

  let purchaseTotal = 0n;
  let supplierPaidInPeriod = 0n;
  let payablesOutstanding = 0n;
  const bySupplierMap = new Map<string, SupplierAgg>();

  function supplierBucket(supplierId: string | null, supplierName: string | null): SupplierAgg {
    const name = (supplierName ?? "").trim() || "Без имени";
    const key = (supplierId ?? "").trim() || `name:${name}`;
    let row = bySupplierMap.get(key);
    if (!row) {
      row = {
        supplierKey: key,
        supplierName: name,
        purchaseTotal: 0n,
        paidInPeriod: 0n,
        remaining: 0n,
      };
      bySupplierMap.set(key, row);
    }
    return row;
  }

  if (deps.purchaseDocuments) {
    const summaries = await deps.purchaseDocuments.listSummaries();
    for (const s of summaries) {
      const detail = await deps.purchaseDocuments.findByIdWithLines(s.id);
      if (!detail) {
        continue;
      }
      const day = detail.docDate.slice(0, 10);
      let linesTotal = 0n;
      for (const line of detail.lines) {
        linesTotal += BigInt(line.lineTotalKopecks);
      }
      const total = linesTotal + BigInt(detail.extraCostKopecks);
      const bucket = supplierBucket(detail.supplierId, detail.supplierName);
      if (inPeriod(day, fromYmd, toYmd)) {
        purchaseTotal += total;
        bucket.purchaseTotal += total;
      }
      if (deps.supplierPayments) {
        const pays = await deps.supplierPayments.listByDocumentId(detail.id);
        let paidToDate = 0n;
        for (const p of pays) {
          const pd = ymdUtc(p.paidAt);
          if (inPeriod(pd, fromYmd, toYmd)) {
            supplierPaidInPeriod += p.amountKopecks;
            bucket.paidInPeriod += p.amountKopecks;
          }
          if (pd <= toYmd) {
            paidToDate += p.amountKopecks;
          }
        }
        if (day <= toYmd && total > 0n) {
          const rem = Obligation.restore({
            debtKopecks: total,
            paidKopecks: paidToDate,
          }).remainingKopecks();
          payablesOutstanding += rem;
          bucket.remaining += rem;
        }
      }
    }
  }
  overall.purchaseTotal = purchaseTotal;
  overall.supplierPaid = supplierPaidInPeriod;
  overall.payablesOutstanding = payablesOutstanding;

  const bySupplier = [...bySupplierMap.values()]
    .filter((r) => r.purchaseTotal > 0n || r.paidInPeriod > 0n || r.remaining > 0n)
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ru"))
    .map((r) => ({
      supplierKey: r.supplierKey,
      supplierName: r.supplierName,
      purchaseTotalKopecks: r.purchaseTotal.toString(),
      paidKopecks: r.paidInPeriod.toString(),
      remainingKopecks: r.remaining.toString(),
    }));

  const base = sliceToSummaryJson(fromYmd, toYmd, overall, bySupplier);

  if (!hasAccountingPeriodScope(scope)) {
    return {
      ...base,
      destinationCode: null,
      tripId: null,
      selected: null,
      trips: [] as ReturnType<typeof tripRowToJson>[],
    };
  }

  const scopedIds = new Set(scopedTrips.map((t) => t.getId()));
  const selectedRows = overallTripRows.filter((r) => scopedIds.has(r.tripId));
  const selectedTotals = emptySliceTotals();
  for (const row of selectedRows) {
    selectedTotals.revenueCash += row.revenueCash;
    selectedTotals.revenueCard += row.revenueCard;
    selectedTotals.revenueDebt += row.revenueDebt;
    selectedTotals.costSold += row.costSold;
    selectedTotals.costShortage += row.costShortage;
    selectedTotals.grossProfit += row.grossProfit;
    selectedTotals.tripExpenses += row.tripExpenses;
    selectedTotals.sellerFieldWithoutRent += row.sellerFieldWithoutRent;
    selectedTotals.sellerRent += row.sellerRent;
    selectedTotals.sellerMoneySends += row.sellerMoneySends;
    selectedTotals.debtPaid += row.debtPaid;
    selectedTotals.debtOutstanding += row.debtOutstanding;
  }
  selectedTotals.receivablesOutstanding = selectedTotals.debtOutstanding;

  return {
    ...base,
    destinationCode: scope.destinationCode?.trim() || null,
    tripId: scope.tripId?.trim() || null,
    selected: sliceToSummaryJson(fromYmd, toYmd, selectedTotals, []),
    trips: selectedRows.map(tripRowToJson),
  };
}
