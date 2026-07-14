/**
 * Кг, которые можно положить в строку ПН: склад минус журнал возвратов минус резерв в других активных ПН.
 */
export function availableGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  qualityRejectReturnGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
}): bigint {
  const returned = input.qualityRejectReturnGrams > 0n ? input.qualityRejectReturnGrams : 0n;
  const afterReturn =
    input.onWarehouseGrams > returned ? input.onWarehouseGrams - returned : 0n;
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  return afterReturn > reserved ? afterReturn - reserved : 0n;
}
