import type {
  TripSaleAggregate,
  TripSaleBatchLine,
  TripSaleClientLine,
} from "../ports/trip-sale-repository.port.js";

export type TripSaleRowForAggregate = {
  batchId: string;
  grams: bigint;
  packageCount?: bigint;
  revenueKopecks: bigint;
  cashKopecks: bigint;
  debtKopecks: bigint;
  cardTransferKopecks?: bigint;
  clientLabel: string | null | undefined;
  /** Без поля — как розница (данные до введения канала). */
  saleChannel?: "retail" | "wholesale";
};

type BatchMaps = {
  grams: Map<string, bigint>;
  packages: Map<string, bigint>;
  revenue: Map<string, bigint>;
  cash: Map<string, bigint>;
  debt: Map<string, bigint>;
  card: Map<string, bigint>;
};

type ClientMaps = {
  grams: Map<string, bigint>;
  revenue: Map<string, bigint>;
  cash: Map<string, bigint>;
  debt: Map<string, bigint>;
  card: Map<string, bigint>;
};

function emptyBatchMaps(): BatchMaps {
  return {
    grams: new Map(),
    packages: new Map(),
    revenue: new Map(),
    cash: new Map(),
    debt: new Map(),
    card: new Map(),
  };
}

function emptyClientMaps(): ClientMaps {
  return {
    grams: new Map(),
    revenue: new Map(),
    cash: new Map(),
    debt: new Map(),
    card: new Map(),
  };
}

function addToBatchMaps(maps: BatchMaps, batchId: string, r: TripSaleRowForAggregate, card: bigint): void {
  maps.grams.set(batchId, (maps.grams.get(batchId) ?? 0n) + r.grams);
  maps.packages.set(batchId, (maps.packages.get(batchId) ?? 0n) + (r.packageCount ?? 0n));
  maps.revenue.set(batchId, (maps.revenue.get(batchId) ?? 0n) + r.revenueKopecks);
  maps.cash.set(batchId, (maps.cash.get(batchId) ?? 0n) + r.cashKopecks);
  maps.debt.set(batchId, (maps.debt.get(batchId) ?? 0n) + r.debtKopecks);
  maps.card.set(batchId, (maps.card.get(batchId) ?? 0n) + card);
}

function addToClientMaps(maps: ClientMaps, clientKey: string, r: TripSaleRowForAggregate, card: bigint): void {
  maps.grams.set(clientKey, (maps.grams.get(clientKey) ?? 0n) + r.grams);
  maps.revenue.set(clientKey, (maps.revenue.get(clientKey) ?? 0n) + r.revenueKopecks);
  maps.cash.set(clientKey, (maps.cash.get(clientKey) ?? 0n) + r.cashKopecks);
  maps.debt.set(clientKey, (maps.debt.get(clientKey) ?? 0n) + r.debtKopecks);
  maps.card.set(clientKey, (maps.card.get(clientKey) ?? 0n) + card);
}

function batchLinesFromMaps(maps: BatchMaps): TripSaleBatchLine[] {
  const batchIds = new Set([
    ...maps.grams.keys(),
    ...maps.packages.keys(),
    ...maps.revenue.keys(),
    ...maps.cash.keys(),
    ...maps.debt.keys(),
    ...maps.card.keys(),
  ]);
  return [...batchIds]
    .sort((a, b) => a.localeCompare(b, "ru"))
    .map((batchId) => ({
      batchId,
      grams: maps.grams.get(batchId) ?? 0n,
      packageCount: maps.packages.get(batchId) ?? 0n,
      revenueKopecks: maps.revenue.get(batchId) ?? 0n,
      cashKopecks: maps.cash.get(batchId) ?? 0n,
      debtKopecks: maps.debt.get(batchId) ?? 0n,
      cardTransferKopecks: maps.card.get(batchId) ?? 0n,
    }));
}

function clientLinesFromMaps(maps: ClientMaps): TripSaleClientLine[] {
  const clientKeys = [...maps.grams.keys()];
  clientKeys.sort((a, b) => {
    if (a === "") {
      return 1;
    }
    if (b === "") {
      return -1;
    }
    return a.localeCompare(b, "ru");
  });
  return clientKeys.map((clientLabel) => ({
    clientLabel,
    grams: maps.grams.get(clientLabel) ?? 0n,
    revenueKopecks: maps.revenue.get(clientLabel) ?? 0n,
    cashKopecks: maps.cash.get(clientLabel) ?? 0n,
    debtKopecks: maps.debt.get(clientLabel) ?? 0n,
    cardTransferKopecks: maps.card.get(clientLabel) ?? 0n,
  }));
}

/** Сводка продаж по рейсу из сырых строк журнала (партии и клиенты). */
export function buildTripSaleAggregateFromRows(rows: TripSaleRowForAggregate[]): TripSaleAggregate {
  const allBatch = emptyBatchMaps();
  const retailBatch = emptyBatchMaps();
  const wholesaleBatch = emptyBatchMaps();
  const allClient = emptyClientMaps();
  const retailClient = emptyClientMaps();
  const wholesaleClient = emptyClientMaps();

  let totalGrams = 0n;
  let totalPackageCount = 0n;
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
    const clientKey = (r.clientLabel ?? "").trim();
    const isWholesale = r.saleChannel === "wholesale";

    totalGrams += r.grams;
    totalPackageCount += r.packageCount ?? 0n;
    totalRevenue += r.revenueKopecks;
    totalCash += r.cashKopecks;
    totalDebt += r.debtKopecks;
    totalCard += card;

    addToBatchMaps(allBatch, r.batchId, r, card);
    addToClientMaps(allClient, clientKey, r, card);

    if (isWholesale) {
      wholesaleGrams += r.grams;
      wholesaleRevenue += r.revenueKopecks;
      wholesaleCash += r.cashKopecks;
      wholesaleDebt += r.debtKopecks;
      wholesaleCard += card;
      addToBatchMaps(wholesaleBatch, r.batchId, r, card);
      addToClientMaps(wholesaleClient, clientKey, r, card);
    } else {
      retailGrams += r.grams;
      retailRevenue += r.revenueKopecks;
      retailCash += r.cashKopecks;
      retailDebt += r.debtKopecks;
      retailCard += card;
      addToBatchMaps(retailBatch, r.batchId, r, card);
      addToClientMaps(retailClient, clientKey, r, card);
    }
  }

  return {
    totalGrams,
    totalPackageCount,
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
    byBatch: batchLinesFromMaps(allBatch),
    byClient: clientLinesFromMaps(allClient),
    retailByBatch: batchLinesFromMaps(retailBatch),
    wholesaleByBatch: batchLinesFromMaps(wholesaleBatch),
    retailByClient: clientLinesFromMaps(retailClient),
    wholesaleByClient: clientLinesFromMaps(wholesaleClient),
  };
}
