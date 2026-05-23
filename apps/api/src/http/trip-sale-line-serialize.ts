import type { TripSaleLineRecord } from "../application/ports/trip-sale-repository.port.js";

export type TripSaleLineJson = {
  id: string;
  tripId: string;
  batchId: string;
  saleId: string;
  kg: string;
  packageCount: string | null;
  pricePerKgKopecks: string;
  revenueKopecks: string;
  cashKopecks: string;
  debtKopecks: string;
  cardTransferKopecks: string;
  saleChannel: "retail" | "wholesale";
  clientLabel: string | null;
  wholesaleBuyerId: string | null;
  recordedAt: string;
};

export function tripSaleLineToJson(line: TripSaleLineRecord): TripSaleLineJson {
  const kgWhole = line.grams / 1000n;
  const kgRem = line.grams % 1000n;
  const kg =
    kgRem === 0n
      ? kgWhole.toString()
      : `${kgWhole}.${kgRem.toString().padStart(3, "0").replace(/0+$/, "")}`;
  return {
    id: line.id,
    tripId: line.tripId,
    batchId: line.batchId,
    saleId: line.saleId,
    kg,
    packageCount: line.packageCount == null ? null : line.packageCount.toString(),
    pricePerKgKopecks: line.pricePerKgKopecks.toString(),
    revenueKopecks: line.revenueKopecks.toString(),
    cashKopecks: line.cashKopecks.toString(),
    debtKopecks: line.debtKopecks.toString(),
    cardTransferKopecks: line.cardTransferKopecks.toString(),
    saleChannel: line.saleChannel,
    clientLabel: line.clientLabel,
    wholesaleBuyerId: line.wholesaleBuyerId,
    recordedAt: line.recordedAt.toISOString(),
  };
}
