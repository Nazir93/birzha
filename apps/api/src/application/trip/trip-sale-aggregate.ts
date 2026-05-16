import type {
  TripSaleAggregate,
  TripSaleClientLine,
} from "../ports/trip-sale-repository.port.js";

export type TripSaleRowForAggregate = {
  batchId: string;
  grams: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks?: bigint;
  clientLabel: string | null | undefined;
  /** Без поля — как розница (данные до введения канала). */
  saleChannel?: "retail" | "wholesale";
};

/** Сводка продаж по рейсу из сырых строк журнала (партии и клиенты). */
export function buildTripSaleAggregateFromRows(rows: TripSaleRowForAggregate[]): TripSaleAggregate {
  const byBatchGrams = new Map<string, bigint>();
  const byBatchRevenue = new Map<string, bigint>();
  const byBatchCash = new Map<string, bigint>();
  const byBatchDebt = new Map<string, bigint>();
  const byBatchCard = new Map<string, bigint>();

  const byClientGrams = new Map<string, bigint>();
  const byClientRevenue = new Map<string, bigint>();
  const byClientCash = new Map<string, bigint>();
  const byClientDebt = new Map<string, bigint>();
  const byClientCard = new Map<string, bigint>();

  let totalGrams = 0n;
  let totalRevenue = 0n;
  let totalCash = 0n;
  let totalDebt = 0n;
  let totalCard = 0n;
  let retailGrams = 0n;
  let wholesaleGrams = 0n;
  let retailRevenue = 0n;
  let wholesaleRevenue = 0n;
  let retailCash = 0n;
  let retailDebt = 0n;
  let retailCard = 0n;
  let wholesaleCash = 0n;
  let wholesaleDebt = 0n;
  let wholesaleCard = 0n;

  for (const r of rows) {
    const card = r.cardTransferKopecks ?? 0n;
    totalGrams += r.grams;
    totalRevenue += r.revenueKopecks;
    totalCash += r.cashKopecks;
    totalDebt += r.debtKopecks;
    totalCard += card;

    const isWholesale = r.saleChannel === "wholesale";
    if (isWholesale) {
      wholesaleGrams += r.grams;
      wholesaleRevenue += r.revenueKopecks;
      wholesaleCash += r.cashKopecks;
      wholesaleDebt += r.debtKopecks;
      wholesaleCard += card;
    } else {
      retailGrams += r.grams;
      retailRevenue += r.revenueKopecks;
      retailCash += r.cashKopecks;
      retailDebt += r.debtKopecks;
      retailCard += card;
    }

    byBatchGrams.set(r.batchId, (byBatchGrams.get(r.batchId) ?? 0n) + r.grams);
    byBatchRevenue.set(r.batchId, (byBatchRevenue.get(r.batchId) ?? 0n) + r.revenueKopecks);
    byBatchCash.set(r.batchId, (byBatchCash.get(r.batchId) ?? 0n) + r.cashKopecks);
    byBatchDebt.set(r.batchId, (byBatchDebt.get(r.batchId) ?? 0n) + r.debtKopecks);
    byBatchCard.set(r.batchId, (byBatchCard.get(r.batchId) ?? 0n) + card);

    const ck = (r.clientLabel ?? "").trim();
    byClientGrams.set(ck, (byClientGrams.get(ck) ?? 0n) + r.grams);
    byClientRevenue.set(ck, (byClientRevenue.get(ck) ?? 0n) + r.revenueKopecks);
    byClientCash.set(ck, (byClientCash.get(ck) ?? 0n) + r.cashKopecks);
    byClientDebt.set(ck, (byClientDebt.get(ck) ?? 0n) + r.debtKopecks);
    byClientCard.set(ck, (byClientCard.get(ck) ?? 0n) + card);
  }

  const batchIds = new Set([...byBatchGrams.keys(), ...byBatchRevenue.keys()]);
  const byBatch = [...batchIds]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((batchId) => ({
      batchId,
      grams: byBatchGrams.get(batchId) ?? 0n,
      revenueKopecks: byBatchRevenue.get(batchId) ?? 0n,
      cashKopecks: byBatchCash.get(batchId) ?? 0n,
      debtKopecks: byBatchDebt.get(batchId) ?? 0n,
      cardTransferKopecks: byBatchCard.get(batchId) ?? 0n,
    }));

  const clientKeys = [...byClientGrams.keys()];
  clientKeys.sort((a, b) => {
    if (a === "") {
      return 1;
    }
    if (b === "") {
      return -1;
    }
    return a.localeCompare(b, "ru");
  });

  const byClient: TripSaleClientLine[] = clientKeys.map((clientLabel) => ({
    clientLabel,
    grams: byClientGrams.get(clientLabel) ?? 0n,
    revenueKopecks: byClientRevenue.get(clientLabel) ?? 0n,
    cashKopecks: byClientCash.get(clientLabel) ?? 0n,
    debtKopecks: byClientDebt.get(clientLabel) ?? 0n,
    cardTransferKopecks: byClientCard.get(clientLabel) ?? 0n,
  }));

  return {
    totalGrams,
    totalRevenueKopecks: totalRevenue,
    totalCashKopecks: totalCash,
    totalDebtKopecks: totalDebt,
    totalCardTransferKopecks: totalCard,
    retailGrams,
    wholesaleGrams,
    retailRevenueKopecks: retailRevenue,
    wholesaleRevenueKopecks: wholesaleRevenue,
    retailCashKopecks: retailCash,
    retailDebtKopecks: retailDebt,
    retailCardTransferKopecks: retailCard,
    wholesaleCashKopecks: wholesaleCash,
    wholesaleDebtKopecks: wholesaleDebt,
    wholesaleCardTransferKopecks: wholesaleCard,
    byBatch,
    byClient,
  };
}
