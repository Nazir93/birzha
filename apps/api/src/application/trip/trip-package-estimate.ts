import type { PurchaseLinePackageMeta } from "../ports/purchase-line-package-meta.port.js";

/** Доля ящиков накладной, пропорциональная отгруженным в рейс граммам. */
export function packagesFromPurchaseProportion(
  shippedGrams: bigint,
  purchasedGrams: bigint,
  linePackageCount: bigint,
): bigint {
  if (shippedGrams <= 0n || purchasedGrams <= 0n || linePackageCount <= 0n) {
    return 0n;
  }
  return (shippedGrams * linePackageCount) / purchasedGrams;
}

/**
 * Ящики отгрузки в рейс: из журнала отгрузки, иначе оценка по строке накладной.
 */
export function effectiveShippedPackages(
  shippedGrams: bigint,
  shippedPackagesLedger: bigint,
  nakladnaya: PurchaseLinePackageMeta | null,
): bigint {
  if (shippedPackagesLedger > 0n) {
    return shippedPackagesLedger;
  }
  if (!nakladnaya) {
    return 0n;
  }
  return packagesFromPurchaseProportion(
    shippedGrams,
    nakladnaya.purchasedGrams,
    nakladnaya.linePackageCount,
  );
}

/** Нужно ли указывать ящики в продаже (отгрузка или накладная). */
export function tripSaleUsesPackageAccounting(
  shippedPackagesLedger: bigint,
  nakladnaya: PurchaseLinePackageMeta | null,
): boolean {
  if (shippedPackagesLedger > 0n) {
    return true;
  }
  return nakladnaya != null && nakladnaya.linePackageCount > 0n;
}

/** Оценка ящиков «в пути» по партии: отгрузка × (остаток кг / отгружено кг). */
export function estimateTripBatchPackagesInTransit(
  shippedG: bigint,
  shippedPackages: bigint,
  soldG: bigint,
  shortageG: bigint,
): bigint {
  if (shippedG <= 0n || shippedPackages <= 0n) {
    return 0n;
  }
  const netG = shippedG - soldG - shortageG;
  if (netG <= 0n) {
    return 0n;
  }
  return (shippedPackages * netG) / shippedG;
}
