function proportionalPackageCount(
  reverseGrams: bigint,
  manifestGrams: bigint,
  manifestPackageCount: bigint | null,
): bigint | null {
  if (manifestPackageCount == null || manifestPackageCount <= 0n || reverseGrams <= 0n || manifestGrams <= 0n) {
    return null;
  }
  return (reverseGrams * manifestPackageCount) / manifestGrams;
}

/** Сколько грамм и ящиков вернуть со склада при отвязке ПН от рейса. */
export function planLoadingManifestDetachTripReverse(input: {
  manifestGrams: bigint;
  manifestPackageCount: bigint | null;
  shipmentGramsOnTrip: bigint;
}): { grams: bigint; packageCount: bigint | null } {
  if (input.manifestGrams <= 0n || input.shipmentGramsOnTrip <= 0n) {
    return { grams: 0n, packageCount: null };
  }
  const grams = input.manifestGrams;
  return {
    grams,
    packageCount: proportionalPackageCount(grams, input.manifestGrams, input.manifestPackageCount),
  };
}
