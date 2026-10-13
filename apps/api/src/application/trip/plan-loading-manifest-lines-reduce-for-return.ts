/**
 * Как уменьшить строки активных ПН при записи «возврат на склад».
 * Снимаем с линий по порядку, пока не исчерпаем массу возврата.
 */
export type LoadingManifestLineReducePlanItem = {
  manifestId: string;
  batchId: string;
  lineNo: number;
  tripId: string | null;
  reduceGrams: bigint;
  newGrams: bigint;
  newPackageCount: bigint | null;
  /** Сколько снять с отгрузки в рейс (если ПН уже привязана). */
  unshipGrams: bigint;
  unshipPackageCount: bigint | null;
};

export type LoadingManifestLineForReturnReduce = {
  manifestId: string;
  batchId: string;
  lineNo: number;
  grams: bigint;
  packageCount: bigint | null;
  tripId: string | null;
  /** Уже в журнале отгрузок по этому рейсу и партии. */
  shipmentGramsOnTrip: bigint;
};

function proportionalPackageCount(
  partGrams: bigint,
  wholeGrams: bigint,
  wholePackageCount: bigint | null,
): bigint | null {
  if (wholePackageCount == null || wholePackageCount <= 0n || partGrams <= 0n || wholeGrams <= 0n) {
    return null;
  }
  return (partGrams * wholePackageCount) / wholeGrams;
}

export function planLoadingManifestLinesReduceForReturn(input: {
  returnGrams: bigint;
  /** Ящики с UI; если заданы — снимаем их, без пропорции от массы. */
  returnPackageCount?: bigint | null;
  lines: readonly LoadingManifestLineForReturnReduce[];
}): LoadingManifestLineReducePlanItem[] {
  let remaining = input.returnGrams > 0n ? input.returnGrams : 0n;
  let remainingPkg =
    input.returnPackageCount != null && input.returnPackageCount > 0n ? input.returnPackageCount : null;
  const out: LoadingManifestLineReducePlanItem[] = [];
  if (remaining <= 0n) {
    return out;
  }

  for (const line of input.lines) {
    if (remaining <= 0n || line.grams <= 0n) {
      continue;
    }
    const reduceGrams = line.grams < remaining ? line.grams : remaining;
    const newGrams = line.grams - reduceGrams;
    let newPackageCount: bigint | null;
    let reducePkg: bigint | null = null;
    if (remainingPkg != null) {
      const linePkg = line.packageCount != null && line.packageCount > 0n ? line.packageCount : 0n;
      const take = linePkg < remainingPkg ? linePkg : remainingPkg;
      reducePkg = take;
      remainingPkg -= take;
      newPackageCount = newGrams <= 0n ? null : linePkg - take;
      if (newPackageCount != null && newPackageCount <= 0n) {
        newPackageCount = 0n;
      }
    } else {
      newPackageCount =
        newGrams <= 0n ? null : proportionalPackageCount(newGrams, line.grams, line.packageCount);
    }
    const unshipCap = line.tripId ? line.shipmentGramsOnTrip : 0n;
    const unshipGrams = unshipCap < reduceGrams ? unshipCap : reduceGrams;
    const unshipPackageCount =
      reducePkg != null
        ? unshipGrams <= 0n
          ? null
          : proportionalPackageCount(unshipGrams, reduceGrams, reducePkg)
        : proportionalPackageCount(unshipGrams, line.grams, line.packageCount);
    out.push({
      manifestId: line.manifestId,
      batchId: line.batchId,
      lineNo: line.lineNo,
      tripId: line.tripId,
      reduceGrams,
      newGrams,
      newPackageCount,
      unshipGrams,
      unshipPackageCount,
    });
    remaining -= reduceGrams;
  }
  return out;
}
