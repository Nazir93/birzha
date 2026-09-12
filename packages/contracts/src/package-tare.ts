/** Тара ящика по умолчанию (помидоры и прочие), кг. */
export const TARE_KG_PER_PACKAGE = 0.5;

/** Тара ящика по умолчанию, граммы (совпадает с domain). */
export const TARE_GRAMS_PER_PACKAGE = 500;

/** Тара ящика для огурцов: 0,4 кг = 400 г. */
export const TARE_GRAMS_CUCUMBERS_PER_PACKAGE = 400;

/** Имя товара в справочнике калибров. */
export const PRODUCT_GROUP_CUCUMBERS = "Огурцы";

/**
 * Тара одного ящика по товару.
 * Помидоры и всё остальное — 500 г; огурцы — 400 г.
 */
export function tareGramsPerPackageForProductGroup(
  productGroup: string | null | undefined,
): number {
  const g = (productGroup ?? "").trim();
  if (g === PRODUCT_GROUP_CUCUMBERS) {
    return TARE_GRAMS_CUCUMBERS_PER_PACKAGE;
  }
  return TARE_GRAMS_PER_PACKAGE;
}

function packagesFloor(packageCount: number | null | undefined): number {
  if (packageCount == null || !Number.isFinite(packageCount) || packageCount < 0) {
    return 0;
  }
  return Math.floor(packageCount);
}

function resolveTareGrams(tareGramsPerPackage: number | undefined): number {
  if (tareGramsPerPackage == null) {
    return TARE_GRAMS_PER_PACKAGE;
  }
  if (!Number.isFinite(tareGramsPerPackage) || tareGramsPerPackage < 0) {
    throw new Error("tare_grams_invalid");
  }
  return Math.floor(tareGramsPerPackage);
}

/** Нетто, кг = брутто − тара × ящики (через граммы, без float-дрейфа). */
export function netKgFromGrossKg(
  grossKg: number,
  packageCount?: number | null,
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): number {
  if (!Number.isFinite(grossKg) || grossKg <= 0) {
    throw new Error("gross_kg_invalid");
  }
  const pkgs = packagesFloor(packageCount);
  const grossGrams = Math.round(grossKg * 1000);
  const tare = pkgs * resolveTareGrams(tareGramsPerPackage);
  if (tare >= grossGrams) {
    throw new Error("net_kg_non_positive");
  }
  return (grossGrams - tare) / 1000;
}

/** Брутто, кг = нетто + тара × ящики (для отображения). */
export function grossKgFromNetKg(
  netKg: number,
  packageCount?: number | null,
  tareGramsPerPackage: number = TARE_GRAMS_PER_PACKAGE,
): number {
  if (!Number.isFinite(netKg) || netKg < 0) {
    throw new Error("net_kg_invalid");
  }
  const pkgs = packagesFloor(packageCount);
  const netGrams = Math.round(netKg * 1000);
  return (netGrams + pkgs * resolveTareGrams(tareGramsPerPackage)) / 1000;
}
