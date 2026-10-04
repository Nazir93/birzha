import { Obligation } from "@birzha/domain";

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

/**
 * Сводка за период для кабинета бухгалтера / кассира.
 * Продажи/себестоимость — по дате выезда рейса; расходы и оплаты — по своей дате.
 */
export async function buildAccountingPeriodSummary(deps: {
  fromYmd: string;
  toYmd: string;
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
  const trips = await deps.trips.list({ limit: 500, offset: 0, order: "departedAtDesc" });

  let revenueCash = 0n;
  let revenueCard = 0n;
  let revenueDebt = 0n;
  let costSold = 0n;
  let costShortage = 0n;
  let grossProfit = 0n;
  let tripExpensesTotal = 0n;
  let debtPaidInPeriod = 0n;

  for (const trip of trips) {
    const tripId = trip.getId();
    const departed = trip.getDepartedAt();
    const day = departed ? ymdUtc(departed) : null;
    if (!day || !inPeriod(day, fromYmd, toYmd)) {
      continue;
    }
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
    revenueCash += sales.totalCashKopecks;
    revenueCard += sales.totalCardTransferKopecks;
    revenueDebt += sales.totalDebtKopecks;
    costSold += fin.costOfSoldKopecks;
    costShortage += fin.costOfShortageKopecks;
    grossProfit += fin.grossProfitKopecks;
  }

  if (deps.tripExpenses) {
    for (const trip of trips) {
      const rows = await deps.tripExpenses.listByTripId(trip.getId());
      for (const e of rows) {
        if (inPeriod(ymdUtc(e.expenseDate), fromYmd, toYmd)) {
          tripExpensesTotal += e.amountKopecks;
        }
      }
    }
  }

  let sellerFieldExpensesTotal = 0n;
  let sellerRentExpensesTotal = 0n;
  if (deps.sellerFieldExpenses) {
    const rows = await deps.sellerFieldExpenses.list({ fromYmd, toYmd });
    for (const e of rows) {
      sellerFieldExpensesTotal += e.amountKopecks;
      if (e.category === "rent") {
        sellerRentExpensesTotal += e.amountKopecks;
      }
    }
  }
  const sellerFieldWithoutRent = sellerFieldExpensesTotal - sellerRentExpensesTotal;

  let purchaserExpensesTotal = 0n;
  if (deps.purchaserExpenses) {
    purchaserExpensesTotal = await deps.purchaserExpenses.sumInPeriod(fromYmd, toYmd);
  }

  let sellerMoneySendsTotal = 0n;
  if (deps.sellerMoneySends) {
    sellerMoneySendsTotal = await deps.sellerMoneySends.sumInPeriod(fromYmd, toYmd);
  }

  const debtGroups = await deps.sales.listDebtGroups();
  for (const g of debtGroups) {
    const pays = await deps.debtPayments.listBySaleId(g.saleId);
    for (const p of pays) {
      if (inPeriod(ymdUtc(p.paidAt), fromYmd, toYmd)) {
        debtPaidInPeriod += p.amountKopecks;
      }
    }
  }

  let receivablesOutstanding = 0n;
  for (const g of debtGroups) {
    if (ymdUtc(g.firstRecordedAt) > toYmd) {
      continue;
    }
    let paidToDate = 0n;
    const pays = await deps.debtPayments.listBySaleId(g.saleId);
    for (const p of pays) {
      if (ymdUtc(p.paidAt) <= toYmd) {
        paidToDate += p.amountKopecks;
      }
    }
    receivablesOutstanding += Obligation.restore({
      debtKopecks: g.debtKopecks,
      paidKopecks: paidToDate,
    }).remainingKopecks();
  }

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

  const operatingExpenses =
    tripExpensesTotal + sellerFieldExpensesTotal + purchaserExpensesTotal + sellerMoneySendsTotal;
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

  return {
    from: fromYmd,
    to: toYmd,
    revenueCashKopecks: revenueCash.toString(),
    revenueCardKopecks: revenueCard.toString(),
    revenueDebtKopecks: revenueDebt.toString(),
    revenueTotalKopecks: (revenueCash + revenueCard + revenueDebt).toString(),
    debtPaidKopecks: debtPaidInPeriod.toString(),
    costOfSoldKopecks: costSold.toString(),
    costOfShortageKopecks: costShortage.toString(),
    grossProfitKopecks: grossProfit.toString(),
    /** Расходы по рейсу (топливо и т.п.) — для обратной совместимости. */
    expensesKopecks: tripExpensesTotal.toString(),
    tripExpensesKopecks: tripExpensesTotal.toString(),
    sellerFieldExpensesKopecks: sellerFieldWithoutRent.toString(),
    sellerRentExpensesKopecks: sellerRentExpensesTotal.toString(),
    purchaserExpensesKopecks: purchaserExpensesTotal.toString(),
    sellerMoneySendsKopecks: sellerMoneySendsTotal.toString(),
    operatingExpensesKopecks: operatingExpenses.toString(),
    netProfitKopecks: (grossProfit - operatingExpenses).toString(),
    purchaseTotalKopecks: purchaseTotal.toString(),
    supplierPaidKopecks: supplierPaidInPeriod.toString(),
    receivablesOutstandingKopecks: receivablesOutstanding.toString(),
    payablesOutstandingKopecks: payablesOutstanding.toString(),
    bySupplier,
  };
}
