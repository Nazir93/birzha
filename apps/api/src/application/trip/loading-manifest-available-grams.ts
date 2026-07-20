/**
 * Кг, которые можно положить в строку ПН:
 * склад минус резерв в других активных ПН минус журнал «возврат на склад».
 */
export function availableGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
  qualityRejectReturnedGrams?: bigint;
}): bigint {
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  const returned =
    input.qualityRejectReturnedGrams != null && input.qualityRejectReturnedGrams > 0n
      ? input.qualityRejectReturnedGrams
      : 0n;
  const blocked = reserved + returned;
  return input.onWarehouseGrams > blocked ? input.onWarehouseGrams - blocked : 0n;
}
