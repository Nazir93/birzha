/** Тара ящика по умолчанию (помидоры и прочие товары): 0,5 кг = 500 г. */
export const TARE_GRAMS_PER_PACKAGE = 500n;

/** Тара ящика для огурцов: 0,4 кг = 400 г. */
export const TARE_GRAMS_CUCUMBERS_PER_PACKAGE = 400n;

/** Имя товара в справочнике калибров (`product_grades.product_group`). */
export const PRODUCT_GROUP_CUCUMBERS = "Огурцы";

/**
 * Тара одного ящика по товару.
 * Помидоры и всё остальное — 500 г; огурцы — 400 г.
 */
export function tareGramsPerPackageForProductGroup(
  productGroup: string | null | undefined,
): bigint {
  const g = (productGroup ?? "").trim();
  if (g === PRODUCT_GROUP_CUCUMBERS) {
    return TARE_GRAMS_CUCUMBERS_PER_PACKAGE;
  }
  return TARE_GRAMS_PER_PACKAGE;
}

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

function resolveTareGrams(tareGramsPerPackage: bigint | number | undefined): bigint {
  if (tareGramsPerPackage == null) {
    return TARE_GRAMS_PER_PACKAGE;
  }
  if (typeof tareGramsPerPackage === "bigint") {
    if (tareGramsPerPackage < 0n) {
      throw new InvalidPackageTareError("tare_grams_negative");
    }
    return tareGramsPerPackage;
  }
  if (!Number.isFinite(tareGramsPerPackage) || tareGramsPerPackage < 0) {
    throw new InvalidPackageTareError("tare_grams_invalid");
  }
  return BigInt(Math.floor(tareGramsPerPackage));
}

/** Брутто → нетто: нетто = брутто − тара × ящики. При 0 ящиков нетто = брутто. */
export function netGramsFromGross(
  grossGrams: bigint,
  packageCount: number | bigint | null | undefined,
  tareGramsPerPackage: bigint | number = TARE_GRAMS_PER_PACKAGE,
): bigint {
  if (grossGrams < 0n) {
    throw new InvalidPackageTareError("gross_grams_negative");
  }
  const pkgs = packagesAsBigInt(packageCount);
  const tare = pkgs * resolveTareGrams(tareGramsPerPackage);
  if (tare >= grossGrams) {
    throw new InvalidPackageTareError("net_grams_non_positive");
  }
  return grossGrams - tare;
}

/** Нетто → брутто (для отображения): брутто = нетто + тара × ящики. */
export function grossGramsFromNet(
  netGrams: bigint,
  packageCount: number | bigint | null | undefined,
  tareGramsPerPackage: bigint | number = TARE_GRAMS_PER_PACKAGE,
): bigint {
  if (netGrams < 0n) {
    throw new InvalidPackageTareError("net_grams_negative");
  }
  const pkgs = packagesAsBigInt(packageCount);
  return netGrams + pkgs * resolveTareGrams(tareGramsPerPackage);
}
