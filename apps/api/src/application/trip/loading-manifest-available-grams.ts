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

export type ReleaseLoadingBlocksMode =
  /** Новая ПН: снять блокировку только если журнал обнулил доступность (available=0). */
  | "when_available_zero"
  /** Догрузка: снять, если блокировка режет свободный склад (чтобы вернуть кг в ту же ПН). */
  | "when_blocking_reduces_free";

/**
 * Партии, у которых журнал возврата мешает положить свободный склад в ПН.
 * При явном отборе (create/add-batches) блокировку снимаем по режиму.
 */
export function batchIdsToReleaseLoadingBlocks(
  rows: readonly {
    batchId: string;
    physicalFreeGrams: bigint;
    availableGrams: bigint;
  }[],
  mode: ReleaseLoadingBlocksMode = "when_available_zero",
): string[] {
  return rows
    .filter((r) => {
      if (r.physicalFreeGrams <= 0n) {
        return false;
      }
      if (mode === "when_blocking_reduces_free") {
        return r.availableGrams < r.physicalFreeGrams;
      }
      return r.availableGrams <= 0n;
    })
    .map((r) => r.batchId);
}

/** Есть ли партии к снятию блокировки (режим новой ПН). */
export function shouldReleaseLoadingBlocksForManifest(rows: readonly {
  physicalFreeGrams: bigint;
  availableGrams: bigint;
}[]): boolean {
  return batchIdsToReleaseLoadingBlocks(
    rows.map((r, i) => ({ batchId: String(i), ...r })),
    "when_available_zero",
  ).length > 0;
}
