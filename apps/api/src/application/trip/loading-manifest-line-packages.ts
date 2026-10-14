/**
 * Ящики в новую строку ПН.
 * Если в ПН или в возврате из отбора ящики указаны явно — факт: закупка − ПН − возврат.
 * Иначе — доля от закупки по кг (старые данные без ящиков).
 */
export function packagesForNewManifestLine(input: {
  purchaseLinePackageCount: bigint | null;
  totalGrams: bigint;
  /** Кг, которые уйдут в строку (склад − черновые ПН − возврат из отбора). */
  lineGrams: bigint;
  /** Кг склада без учёта возврата из отбора. */
  physicalFreeGrams: bigint;
  /** Ящики во всех строках ПН по партии; null — нигде не заданы. */
  packagesInManifests: bigint | null;
  /** Ящики в возвратах из отбора (blocks_loading); null — не заданы. */
  blockingReturnPackages: bigint | null;
}): bigint | null {
  const purchase = input.purchaseLinePackageCount;
  if (purchase == null || purchase <= 0n || input.lineGrams <= 0n) {
    return null;
  }
  if (input.packagesInManifests == null && input.blockingReturnPackages == null) {
    if (input.totalGrams <= 0n) {
      return null;
    }
    return (input.lineGrams * purchase + input.totalGrams / 2n) / input.totalGrams;
  }
  const onShelf = clampNonNegative(purchase - (input.packagesInManifests ?? 0n));
  if (input.blockingReturnPackages != null) {
    return clampNonNegative(onShelf - input.blockingReturnPackages);
  }
  if (input.physicalFreeGrams > 0n && input.lineGrams < input.physicalFreeGrams) {
    return (onShelf * input.lineGrams + input.physicalFreeGrams / 2n) / input.physicalFreeGrams;
  }
  return onShelf;
}

function clampNonNegative(n: bigint): bigint {
  return n > 0n ? n : 0n;
}
