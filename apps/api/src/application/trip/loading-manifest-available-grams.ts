/**
 * Кг, которые можно положить в строку ПН: склад минус резерв в других активных ПН.
 * Журнал «возврат на склад» не уменьшает доступность — товар можно грузить в другое направление.
 */
export function availableGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
  /** @deprecated Игнорируется: журнал возврата не блокирует погрузку. */
  qualityRejectReturnedGrams?: bigint;
}): bigint {
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  return input.onWarehouseGrams > reserved ? input.onWarehouseGrams - reserved : 0n;
}
