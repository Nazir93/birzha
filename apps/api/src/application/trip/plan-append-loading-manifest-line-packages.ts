/**
 * Ящики строки ПН при догрузке: явное число с UI или пропорционально массе (как раньше).
 */
export function planAppendLoadingManifestLinePackages(input: {
  kind: "increase" | "insert";
  existingLinePackageCount: bigint | null;
  /** Добавляемые ящики с UI; если нет — считаем по массе. */
  requestedAddPackageCount?: bigint | null;
  totalBatchGrams: bigint;
  targetLineGrams: bigint;
  purchaseLinePackageCount: bigint | null;
}): bigint | null {
  if (input.requestedAddPackageCount != null) {
    const add = input.requestedAddPackageCount > 0n ? input.requestedAddPackageCount : 0n;
    if (input.kind === "increase") {
      const prev = input.existingLinePackageCount ?? 0n;
      return prev + add;
    }
    return add > 0n ? add : null;
  }
  return packageCountForPart(
    input.totalBatchGrams,
    input.targetLineGrams,
    input.purchaseLinePackageCount,
  );
}

function packageCountForPart(
  totalGrams: bigint,
  partGrams: bigint,
  linePackageCount: bigint | null,
): bigint | null {
  if (linePackageCount == null || linePackageCount <= 0n || totalGrams <= 0n || partGrams <= 0n) {
    return null;
  }
  return (partGrams * linePackageCount + totalGrams / 2n) / totalGrams;
}
