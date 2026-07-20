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
  lines: readonly LoadingManifestLineForReturnReduce[];
}): LoadingManifestLineReducePlanItem[] {
  let remaining = input.returnGrams > 0n ? input.returnGrams : 0n;
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
    const newPackageCount =
      newGrams <= 0n ? null : proportionalPackageCount(newGrams, line.grams, line.packageCount);
    const unshipCap = line.tripId ? line.shipmentGramsOnTrip : 0n;
    const unshipGrams = unshipCap < reduceGrams ? unshipCap : reduceGrams;
    const unshipPackageCount = proportionalPackageCount(
      unshipGrams,
      line.grams,
      line.packageCount,
    );
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
