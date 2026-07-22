/**
 * Кг в строку ПН: склад минус резерв черновых ПН минус возврат из отбора (blocks_loading).
 * Возврат с рейса на склад (blocks_loading=false) доступность не уменьшает.
 * После создания ПН блокировку снимают — возвращённое снова можно грузить.
 */
export function availableGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
  /** Кг журнала возврата из отбора (один раз не попадают в ПН). */
  blockingReturnGrams?: bigint;
}): bigint {
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  const blocking = input.blockingReturnGrams != null && input.blockingReturnGrams > 0n
    ? input.blockingReturnGrams
    : 0n;
  const free = input.onWarehouseGrams > reserved ? input.onWarehouseGrams - reserved : 0n;
  return free > blocking ? free - blocking : 0n;
}

/** Физически свободно на складе (без учёта журнала возврата). */
export function physicalFreeGramsForLoadingManifestLine(input: {
  onWarehouseGrams: bigint;
  reservedOnOtherManifestsGrams: bigint;
}): bigint {
  const reserved =
    input.reservedOnOtherManifestsGrams > 0n ? input.reservedOnOtherManifestsGrams : 0n;
  return input.onWarehouseGrams > reserved ? input.onWarehouseGrams - reserved : 0n;
}

/**
 * Если весь отбор «заблокирован» возвратом, а на складе есть кг — снимаем блокировку
 * (пользователь грузит возвращённый товар в новую ПН).
 */
export function shouldReleaseLoadingBlocksForManifest(rows: readonly {
  physicalFreeGrams: bigint;
  availableGrams: bigint;
}[]): boolean {
  if (rows.length === 0) {
    return false;
  }
  const anyPhysical = rows.some((r) => r.physicalFreeGrams > 0n);
  const noneAvailable = rows.every((r) => r.availableGrams <= 0n);
  return anyPhysical && noneAvailable;
}
