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

/**
 * Ящики «в пути» по партии (как в отчёте продавца): доля по кг и, если уже продавали
 * с указанием ящиков, не больше остатка по журналу ящиков.
 */
export function estimateTripBatchPackagesInTransit(
  shippedG: bigint,
  shippedPackages: bigint,
  soldG: bigint,
  shortageG: bigint,
  soldPackages: bigint = 0n,
): bigint {
  if (shippedG <= 0n || shippedPackages <= 0n) {
    return 0n;
  }
  const netG = shippedG - soldG - shortageG;
  if (netG <= 0n) {
    return 0n;
  }
  const byKg = (shippedPackages * netG) / shippedG;
  if (soldPackages > 0n) {
    const byLedger = shippedPackages - soldPackages;
    if (byLedger <= 0n) {
      return 0n;
    }
    return byLedger < byKg ? byLedger : byKg;
  }
  return byKg;
}
