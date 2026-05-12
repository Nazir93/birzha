import type { TripSaleAggregate } from "../ports/trip-sale-repository.port.js";
import type { TripShipmentAggregate } from "../ports/trip-shipment-repository.port.js";
import type { TripShortageAggregate } from "../ports/trip-shortage-repository.port.js";

export type TripTransitDigest = {
  /** Был ли товар отгружен в этот рейс (по журналу отгрузок). */
  hasShipmentToTrip: boolean;
  /** Сумма max(0, отгружено − продано − недостача) по партиям — «остаток в пути» для отчёта. */
  remainingNetTransitGrams: bigint;
};

/**
 * Сводка по рейсу для списка рейсов: совпадает с логикой «остаток в пути» в отчёте (без фильтра по продавцу).
 */
export function computeTripTransitDigest(
  shipment: TripShipmentAggregate,
  sales: TripSaleAggregate,
  shortage: TripShortageAggregate,
): TripTransitDigest {
  const shipM = new Map(shipment.byBatch.map((l) => [l.batchId, l.grams]));
  const soldM = new Map(sales.byBatch.map((l) => [l.batchId, l.grams]));
  const shortM = new Map(shortage.byBatch.map((l) => [l.batchId, l.grams]));

  const ids = new Set<string>();
  for (const id of shipM.keys()) {
    ids.add(id);
  }
  for (const id of soldM.keys()) {
    ids.add(id);
  }
  for (const id of shortM.keys()) {
    ids.add(id);
  }

  let remainingSum = 0n;
  for (const id of ids) {
    const net = (shipM.get(id) ?? 0n) - (soldM.get(id) ?? 0n) - (shortM.get(id) ?? 0n);
    if (net > 0n) {
      remainingSum += net;
    }
  }

  return {
    hasShipmentToTrip: shipment.totalGrams > 0n,
    remainingNetTransitGrams: remainingSum,
  };
}
