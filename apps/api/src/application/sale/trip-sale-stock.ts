import { estimateTripBatchPackagesInTransit } from "../trip/trip-package-estimate.js";

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
  soldGramsIncludingLine: bigint;
  soldPackagesIncludingLine: bigint;
  shortageGrams: bigint;
  lineGrams: bigint;
  linePackages: bigint;
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

  if (input.shippedPackages > 0n) {
    if (salePackageCount === null) {
      throw new Error("Укажите количество ящиков в продаже");
    }
    if (salePackageCount <= 0n) {
      throw new Error("Количество ящиков должно быть больше нуля");
    }
    const maxPkg = estimateTripBatchPackagesInTransit(
      input.shippedGrams,
      input.shippedPackages,
      soldGramsExcl,
      input.shortageGrams,
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
