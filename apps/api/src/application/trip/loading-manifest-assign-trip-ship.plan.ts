/**
 * Сколько грамм нужно отразить при привязке ПН к рейсу: либо списание со склада (ShipToTrip),
 * либо только строка журнала отгрузки, если масса уже в «в пути» без строки по этому рейсу.
 */
export type LoadingManifestAssignTripShipPlan =
  | { kind: "none" }
  | { kind: "ship_from_warehouse"; grams: bigint }
  | { kind: "ledger_append_in_transit"; grams: bigint };

export function planLoadingManifestAssignTripShipment(input: {
  /** Граммы по строке ПН. */
  lineGrams: bigint;
  /** Уже учтено в trip_batch_shipments для этого рейса и партии. */
  ledgerGramsForTripBatch: bigint;
  onWarehouseGrams: bigint;
  inTransitGrams: bigint;
}): LoadingManifestAssignTripShipPlan {
  const delta = input.lineGrams - input.ledgerGramsForTripBatch;
  if (delta <= 0n) {
    return { kind: "none" };
  }
  const fromWh = delta < input.onWarehouseGrams ? delta : input.onWarehouseGrams;
  if (fromWh > 0n) {
    return { kind: "ship_from_warehouse", grams: fromWh };
  }
  const only = delta < input.inTransitGrams ? delta : input.inTransitGrams;
  if (only > 0n) {
    return { kind: "ledger_append_in_transit", grams: only };
  }
  return { kind: "none" };
}
