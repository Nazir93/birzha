/**
 * Сколько грамм нужно отразить при привязке ПН к рейсу: либо списание со склада (ShipToTrip),
 * либо только строка журнала отгрузки, если масса уже в «в пути» без строки по этому рейсу.
 */
export type LoadingManifestAssignTripShipPlan =
  | { kind: "none" }
  | { kind: "ship_from_warehouse"; grams: bigint; packageCount: bigint | null }
  | { kind: "ledger_append_in_transit"; grams: bigint; packageCount: bigint | null };

function proportionalPackageCount(
  assignedGrams: bigint,
  lineGrams: bigint,
  linePackageCount: bigint | null | undefined,
): bigint | null {
  if (linePackageCount == null || linePackageCount <= 0n || assignedGrams <= 0n || lineGrams <= 0n) {
    return null;
  }
  return (assignedGrams * linePackageCount) / lineGrams;
}

export function planLoadingManifestAssignTripShipment(input: {
  /** Граммы по строке ПН. */
  lineGrams: bigint;
  /** Ящики по строке ПН (если были указаны при сохранении). */
  linePackageCount: bigint | null;
  /** Уже учтено в trip_batch_shipments для этого рейса и партии. */
  ledgerGramsForTripBatch: bigint;
  /** Уже учтено в trip_batch_shipments по ящикам для этого рейса и партии. */
  ledgerPackageCountForTripBatch: bigint;
  onWarehouseGrams: bigint;
  inTransitGrams: bigint;
  /** Отгрузки по партии в журналах других рейсов (без текущего). */
  shipmentGramsOtherTrips: bigint;
}): LoadingManifestAssignTripShipPlan {
  const delta = input.lineGrams - input.ledgerGramsForTripBatch;
  if (delta <= 0n) {
    return { kind: "none" };
  }
  const availableWh = input.onWarehouseGrams > 0n ? input.onWarehouseGrams : 0n;
  const linePkg = input.linePackageCount ?? 0n;
  const pkgDelta = linePkg - input.ledgerPackageCountForTripBatch;
  const fromWh = delta < availableWh ? delta : availableWh;
  if (fromWh > 0n) {
    return {
      kind: "ship_from_warehouse",
      grams: fromWh,
      packageCount: packageCountForShipDelta({
        deltaGrams: fromWh,
        lineGrams: input.lineGrams,
        linePackageCount: input.linePackageCount,
        ledgerGrams: input.ledgerGramsForTripBatch,
        pkgDelta,
      }),
    };
  }
  const onlyBase = delta < input.inTransitGrams ? delta : input.inTransitGrams;
  const unallocatedInTransit =
    input.inTransitGrams > input.shipmentGramsOtherTrips
      ? input.inTransitGrams - input.shipmentGramsOtherTrips
      : 0n;
  const only = onlyBase < unallocatedInTransit ? onlyBase : unallocatedInTransit;
  if (only > 0n) {
    return {
      kind: "ledger_append_in_transit",
      grams: only,
      packageCount: packageCountForShipDelta({
        deltaGrams: only,
        lineGrams: input.lineGrams,
        linePackageCount: input.linePackageCount,
        ledgerGrams: input.ledgerGramsForTripBatch,
        pkgDelta,
      }),
    };
  }
  return { kind: "none" };
}

/** Догрузка до полной строки ПН — ровно оставшиеся ящики; иначе доля по массе. */
function packageCountForShipDelta(input: {
  deltaGrams: bigint;
  lineGrams: bigint;
  linePackageCount: bigint | null;
  ledgerGrams: bigint;
  pkgDelta: bigint;
}): bigint | null {
  if (input.pkgDelta <= 0n) {
    return null;
  }
  const completesLine = input.ledgerGrams + input.deltaGrams >= input.lineGrams;
  if (completesLine) {
    return input.pkgDelta;
  }
  const pkgByMass = proportionalPackageCount(input.deltaGrams, input.lineGrams, input.linePackageCount);
  if (pkgByMass == null) {
    return null;
  }
  return pkgByMass < input.pkgDelta ? pkgByMass : input.pkgDelta;
}
