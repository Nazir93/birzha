import type {
  SalesBlock,
  ShipmentReportResponse,
  TripDebtReceivableRow,
  TripFieldExpenseRow,
  TripSaleLineJson,
} from "../api/types.js";
import { kgNumberToGramsBigInt } from "./seller-trip-caliber-groups.js";

function bi(s: string | null | undefined): bigint {
  if (s == null || s === "") {
    return 0n;
  }
  return BigInt(s);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Локальный YYYY-MM-DD (без сдвига UTC). */
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Локальный календарный день YYYY-MM-DD из ISO / Date-строки. */
export function calendarYmdFromIso(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return localYmd(d);
}

/** День траты: документный YYYY-MM-DD или локальный день из ISO. */
export function expenseYmd(expenseDate: string): string {
  return calendarYmdFromIso(expenseDate);
}

export function listSellerTripReportDays(input: {
  lines: readonly TripSaleLineJson[];
  expenses: readonly TripFieldExpenseRow[];
}): string[] {
  const set = new Set<string>();
  for (const line of input.lines) {
    const ymd = calendarYmdFromIso(line.recordedAt);
    if (ymd) {
      set.add(ymd);
    }
  }
  for (const e of input.expenses) {
    const ymd = expenseYmd(e.expenseDate);
    if (ymd) {
      set.add(ymd);
    }
  }
  return [...set].sort();
}

export function filterSaleLinesByDay(
  lines: readonly TripSaleLineJson[],
  dayYmd: string | null,
): TripSaleLineJson[] {
  if (dayYmd == null) {
    return [...lines];
  }
  return lines.filter((l) => calendarYmdFromIso(l.recordedAt) === dayYmd);
}

export function filterFieldExpensesByDay(
  expenses: readonly TripFieldExpenseRow[],
  dayYmd: string | null,
): TripFieldExpenseRow[] {
  if (dayYmd == null) {
    return [...expenses];
  }
  return expenses.filter((e) => expenseYmd(e.expenseDate) === dayYmd);
}

export function filterDebtReceivablesByDay(
  rows: readonly TripDebtReceivableRow[],
  dayYmd: string | null,
): TripDebtReceivableRow[] {
  if (dayYmd == null) {
    return [...rows];
  }
  return rows.filter((r) => calendarYmdFromIso(r.soldAt) === dayYmd);
}

export function cashToHandOverForDay(cashKopecks: bigint, fieldExpensesKopecks: bigint): bigint {
  return cashKopecks - fieldExpensesKopecks;
}

type MoneyRow = {
  grams: bigint;
  packageCount: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks: bigint;
};

function emptyMoney(): MoneyRow {
  return {
    grams: 0n,
    packageCount: 0n,
    revenueKopecks: 0n,
    cashKopecks: 0n,
    debtKopecks: 0n,
    cardTransferKopecks: 0n,
  };
}

function addLineToMoney(row: MoneyRow, line: TripSaleLineJson): void {
  row.grams += kgNumberToGramsBigInt(Number(line.kg.replace(",", ".")));
  row.packageCount += bi(line.packageCount);
  row.revenueKopecks += bi(line.revenueKopecks);
  row.cashKopecks += bi(line.cashKopecks);
  row.debtKopecks += bi(line.debtKopecks);
  row.cardTransferKopecks += bi(line.cardTransferKopecks);
}

function moneyToBatchJson(batchId: string, row: MoneyRow) {
  return {
    batchId,
    grams: row.grams.toString(),
    packageCount: row.packageCount.toString(),
    revenueKopecks: row.revenueKopecks.toString(),
    cashKopecks: row.cashKopecks.toString(),
    debtKopecks: row.debtKopecks.toString(),
    cardTransferKopecks: row.cardTransferKopecks.toString(),
  };
}

function moneyToClientJson(clientLabel: string, row: MoneyRow) {
  return {
    clientLabel,
    grams: row.grams.toString(),
    packageCount: row.packageCount.toString(),
    revenueKopecks: row.revenueKopecks.toString(),
    cashKopecks: row.cashKopecks.toString(),
    debtKopecks: row.debtKopecks.toString(),
    cardTransferKopecks: row.cardTransferKopecks.toString(),
  };
}

function aggregateBucket(lines: readonly TripSaleLineJson[]): {
  totals: MoneyRow;
  byBatch: Map<string, MoneyRow>;
  byClient: Map<string, MoneyRow>;
} {
  const totals = emptyMoney();
  const byBatch = new Map<string, MoneyRow>();
  const byClient = new Map<string, MoneyRow>();
  for (const line of lines) {
    addLineToMoney(totals, line);
    let batchRow = byBatch.get(line.batchId);
    if (!batchRow) {
      batchRow = emptyMoney();
      byBatch.set(line.batchId, batchRow);
    }
    addLineToMoney(batchRow, line);
    const clientKey = (line.clientLabel ?? "").trim();
    let clientRow = byClient.get(clientKey);
    if (!clientRow) {
      clientRow = emptyMoney();
      byClient.set(clientKey, clientRow);
    }
    addLineToMoney(clientRow, line);
  }
  return { totals, byBatch, byClient };
}

function mapEntriesToBatch(map: Map<string, MoneyRow>) {
  return [...map.entries()].map(([batchId, row]) => moneyToBatchJson(batchId, row));
}

function mapEntriesToClient(map: Map<string, MoneyRow>) {
  return [...map.entries()].map(([clientLabel, row]) => moneyToClientJson(clientLabel, row));
}

/** Сборка SalesBlock из строк журнала (для дневного среза). */
export function aggregateSaleLinesToSalesBlock(lines: readonly TripSaleLineJson[]): SalesBlock {
  const all = aggregateBucket(lines);
  const retail = aggregateBucket(lines.filter((l) => l.saleChannel === "retail"));
  const wholesale = aggregateBucket(lines.filter((l) => l.saleChannel === "wholesale"));
  return {
    totalGrams: all.totals.grams.toString(),
    totalPackageCount: all.totals.packageCount.toString(),
    totalRevenueKopecks: all.totals.revenueKopecks.toString(),
    totalCashKopecks: all.totals.cashKopecks.toString(),
    totalDebtKopecks: all.totals.debtKopecks.toString(),
    totalCardTransferKopecks: all.totals.cardTransferKopecks.toString(),
    retailGrams: retail.totals.grams.toString(),
    wholesaleGrams: wholesale.totals.grams.toString(),
    retailRevenueKopecks: retail.totals.revenueKopecks.toString(),
    wholesaleRevenueKopecks: wholesale.totals.revenueKopecks.toString(),
    retailCashKopecks: retail.totals.cashKopecks.toString(),
    retailDebtKopecks: retail.totals.debtKopecks.toString(),
    retailCardTransferKopecks: retail.totals.cardTransferKopecks.toString(),
    wholesaleCashKopecks: wholesale.totals.cashKopecks.toString(),
    wholesaleDebtKopecks: wholesale.totals.debtKopecks.toString(),
    wholesaleCardTransferKopecks: wholesale.totals.cardTransferKopecks.toString(),
    byBatch: mapEntriesToBatch(all.byBatch),
    byClient: mapEntriesToClient(all.byClient),
    retailByBatch: mapEntriesToBatch(retail.byBatch),
    wholesaleByBatch: mapEntriesToBatch(wholesale.byBatch),
    retailByClient: mapEntriesToClient(retail.byClient),
    wholesaleByClient: mapEntriesToClient(wholesale.byClient),
  };
}

/**
 * При `dayYmd === null` — исходный отчёт.
 * Иначе — продажи/траты/дебиторка за день; к сдаче = нал дня − траты дня.
 * Погрузка и недостача остаются за весь рейс.
 */
export function buildDayScopedReport(
  fullReport: ShipmentReportResponse,
  lines: readonly TripSaleLineJson[],
  dayYmd: string | null,
): ShipmentReportResponse {
  if (dayYmd == null) {
    return fullReport;
  }
  const dayLines = filterSaleLinesByDay(lines, dayYmd);
  const dayExpenses = filterFieldExpensesByDay(fullReport.fieldExpenses ?? [], dayYmd);
  const dayDebts = filterDebtReceivablesByDay(fullReport.debtReceivables ?? [], dayYmd);
  const sales = aggregateSaleLinesToSalesBlock(dayLines);
  let expensesTotal = 0n;
  for (const e of dayExpenses) {
    expensesTotal += bi(e.amountKopecks);
  }
  const cash = bi(sales.totalCashKopecks);
  return {
    ...fullReport,
    sales,
    fieldExpenses: dayExpenses,
    debtReceivables: dayDebts,
    financials: {
      ...fullReport.financials,
      fieldExpensesKopecks: expensesTotal.toString(),
      cashToHandOverKopecks: cashToHandOverForDay(cash, expensesTotal).toString(),
    },
  };
}
