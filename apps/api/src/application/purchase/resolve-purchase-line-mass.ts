import {
  gramsToKg,
  InvalidPackageTareError,
  kgToGrams,
  netGramsFromGross,
  TARE_GRAMS_PER_PACKAGE,
} from "@birzha/domain";

export type PurchaseLineMassInput = {
  grossKg: number;
  packageCount?: number;
  /** Граммы тары на 1 ящик; по умолчанию 500 (помидоры). */
  tareGramsPerPackage?: number | bigint;
};

export type ResolvedPurchaseLineMass = {
  grossGrams: bigint;
  netGrams: bigint;
  netKg: number;
  packageCount: bigint | null;
};

/** Брутто + ящики → нетто для строки ЗН и партии. */
export function resolvePurchaseLineMass(input: PurchaseLineMassInput): ResolvedPurchaseLineMass {
  const pkg =
    input.packageCount === undefined ? null : BigInt(Math.max(0, Math.floor(input.packageCount)));
  const grossGrams = kgToGrams(input.grossKg);
  if (grossGrams <= 0n) {
    throw new InvalidPackageTareError("gross_grams_non_positive");
  }
  const tare = input.tareGramsPerPackage ?? TARE_GRAMS_PER_PACKAGE;
  const netGrams = netGramsFromGross(grossGrams, pkg, tare);
  return {
    grossGrams,
    netGrams,
    netKg: gramsToKg(netGrams),
    packageCount: pkg,
  };
}
