import type { PurchaseLinePackageMeta } from "../ports/purchase-line-package-meta.port.js";
import {
  effectiveShippedPackages,
  estimateTripBatchPackagesInTransit,
  tripSaleUsesPackageAccounting,
} from "../trip/trip-package-estimate.js";

/** Доступно кг в рейсе по партии, если исключить одну строку продажи (для правки). */
export function availableGramsForTripSaleCorrection(input: {
  shippedGrams: bigint;
  soldGramsIncludingLine: bigint;
  shortageGrams: bigint;
  lineGrams: bigint;
}): bigint {
  const soldExcluding = input.soldGramsIncludingLine - input.lineGrams;
  return input.shippedGrams - soldExcluding - input.shortageGrams;
}

export function assertTripSalePackageCount(input: {
  shippedGrams: bigint;
  shippedPackages: bigint;
  nakladnaya?: PurchaseLinePackageMeta | null;
  soldGramsIncludingLine: bigint;
  soldPackagesIncludingLine?: bigint;
  shortageGrams: bigint;
  lineGrams: bigint;
  /** Ящики редактируемой строки (исключаются из «уже продано»). */
  linePackageCount?: bigint;
  packageCount?: number;
}): bigint | null {
  let salePackageCount: bigint | null = null;
  if (input.packageCount !== undefined) {
    if (!Number.isFinite(input.packageCount) || input.packageCount < 0) {
      throw new Error("Ящики: укажите целое неотрицательное число");
    }
    salePackageCount = BigInt(Math.floor(input.packageCount));
  }

  const soldGramsExcl = input.soldGramsIncludingLine - input.lineGrams;
  const soldPkgIncl = input.soldPackagesIncludingLine ?? 0n;
  const linePkg = input.linePackageCount ?? 0n;
  const soldPkgExcl = soldPkgIncl > linePkg ? soldPkgIncl - linePkg : 0n;
  const nakladnaya = input.nakladnaya ?? null;
  const usesPackages = tripSaleUsesPackageAccounting(input.shippedPackages, nakladnaya);
  const effectiveShipped = effectiveShippedPackages(
    input.shippedGrams,
    input.shippedPackages,
    nakladnaya,
  );

  if (usesPackages) {
    if (salePackageCount === null) {
      throw new Error("Укажите количество ящиков в продаже");
    }
    if (salePackageCount <= 0n) {
      throw new Error("Количество ящиков должно быть больше нуля");
    }
    const maxPkg = estimateTripBatchPackagesInTransit(
      input.shippedGrams,
      effectiveShipped,
      soldGramsExcl,
      input.shortageGrams,
      soldPkgExcl,
    );
    if (salePackageCount > maxPkg) {
      throw new Error(
        `Не больше ${maxPkg.toString()} ящ. в машине по этой партии (по отгрузке и уже проданному)`,
      );
    }
  } else if (salePackageCount !== null && salePackageCount > 0n) {
    throw new Error("По этой партии в рейсе ящики при отгрузке не указаны — поле ящиков оставьте пустым");
  }

  return salePackageCount;
}
