/**
 * Кг в строку ПН: склад минус резерв в других ПН минус возврат из отбора (blocks_loading).
 * Возврат с рейса на склад (blocks_loading=false) доступность не уменьшает.
 */
export function availableGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
  /** Кг журнала возврата из отбора (блокируют новую погрузку). */
  blockingReturnGrams?: bigint;
  /** @deprecated Игнорируется. */
  qualityRejectReturnedGrams?: bigint;
}): bigint {
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  const blocking = input.blockingReturnGrams != null && input.blockingReturnGrams > 0n
    ? input.blockingReturnGrams
    : 0n;
  const free = input.onWarehouseGrams > reserved ? input.onWarehouseGrams - reserved : 0n;
  return free > blocking ? free - blocking : 0n;
}
