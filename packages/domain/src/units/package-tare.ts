/** Тара одного ящика: 0,5 кг = 500 г (фикс на весь проект). */
export const TARE_GRAMS_PER_PACKAGE = 500n;

export class InvalidPackageTareError extends Error {
  readonly code = "invalid_package_tare" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidPackageTareError";
  }
}

function packagesAsBigInt(packageCount: number | bigint | null | undefined): bigint {
  if (packageCount == null) {
    return 0n;
  }
  if (typeof packageCount === "bigint") {
    return packageCount < 0n ? 0n : packageCount;
  }
  if (!Number.isFinite(packageCount) || packageCount < 0) {
    return 0n;
  }
  return BigInt(Math.floor(packageCount));
}

/** Брутто → нетто: нетто = брутто − 0,5 кг × ящики. При 0 ящиков нетто = брутто. */
export function netGramsFromGross(
  grossGrams: bigint,
  packageCount: number | bigint | null | undefined,
): bigint {
  if (grossGrams < 0n) {
    throw new InvalidPackageTareError("gross_grams_negative");
  }
  const pkgs = packagesAsBigInt(packageCount);
  const tare = pkgs * TARE_GRAMS_PER_PACKAGE;
  if (tare >= grossGrams) {
    throw new InvalidPackageTareError("net_grams_non_positive");
  }
  return grossGrams - tare;
}

/** Нетто → брутто (для отображения): брутто = нетто + 0,5 кг × ящики. */
export function grossGramsFromNet(
  netGrams: bigint,
  packageCount: number | bigint | null | undefined,
): bigint {
  if (netGrams < 0n) {
    throw new InvalidPackageTareError("net_grams_negative");
  }
  const pkgs = packagesAsBigInt(packageCount);
  return netGrams + pkgs * TARE_GRAMS_PER_PACKAGE;
}
