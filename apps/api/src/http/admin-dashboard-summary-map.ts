export function gramsToKg(grams: bigint | number | null | undefined): number {
  if (grams == null) {
    return 0;
  }
  return Number(grams) / 1000;
}

export type RawGradeStockRow = {
  productGradeId: string;
  code: string;
  displayName: string;
  productGroup: string | null;
  grams: bigint;
  packages: number;
  valueKopecks: bigint;
};

export type RawWarehouseStockRow = {
  warehouseId: string;
  warehouseName: string;
  grams: bigint;
  packages: number;
  valueKopecks: bigint;
};

export type RawProductGroupStockRow = {
  productGroup: string | null;
  grams: bigint;
  packages: number;
  valueKopecks: bigint;
};

export type MappedGradeStockRow = {
  productGradeId: string;
  code: string;
  displayName: string;
  productGroup: string | null;
  kg: number;
  packages: number;
  valueKopecks: string;
};

export type MappedWarehouseStockRow = {
  warehouseId: string;
  warehouseName: string;
  kg: number;
  packages: number;
  valueKopecks: string;
};

export type MappedProductGroupStockRow = {
  productGroup: string;
  kg: number;
  packages: number;
  valueKopecks: string;
};

export type DashboardStockTotals = {
  kg: number;
  packages: number;
  valueKopecks: string;
};

/** Пропорция ящиков по остатку партии (для unit-тестов формулы). */
export function proportionalPackageCount(
  remainingGrams: bigint,
  totalGrams: bigint,
  packageCount: bigint | null,
): number {
  if (totalGrams <= 0n || packageCount == null) {
    return 0;
  }
  return Math.round(Number((remainingGrams * packageCount) / totalGrams));
}

import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../application/units/rub-kopecks.js";

/** Оценка остатка по закупочной цене, копейки (pricePerKg — rub/kg). */
export function remainingValueKopecks(remainingGrams: bigint, pricePerKg: string | number): bigint {
  const rub = typeof pricePerKg === "number" ? pricePerKg : Number(pricePerKg);
  return revenueKopecksFromGramsAndPricePerKg(remainingGrams, rubPerKgToKopecksPerKg(rub));
}

export function mapGradeStockRows(rows: RawGradeStockRow[]): {
  byGrade: MappedGradeStockRow[];
  stockTotals: DashboardStockTotals;
} {
  let stockKg = 0;
  let stockPackages = 0;
  let stockValueKopecks = 0n;

  const byGrade = rows
    .map((row) => {
      const kg = gramsToKg(row.grams);
      const packages = Math.round(row.packages);
      stockKg += kg;
      stockPackages += packages;
      stockValueKopecks += row.valueKopecks;
      return {
        productGradeId: row.productGradeId,
        code: row.code,
        displayName: row.displayName,
        productGroup: row.productGroup,
        kg,
        packages,
        valueKopecks: row.valueKopecks.toString(),
      };
    })
    .sort((a, b) => b.kg - a.kg);

  return {
    byGrade,
    stockTotals: {
      kg: stockKg,
      packages: stockPackages,
      valueKopecks: stockValueKopecks.toString(),
    },
  };
}

export function mapWarehouseStockRows(rows: RawWarehouseStockRow[]): MappedWarehouseStockRow[] {
  return rows
    .map((row) => ({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      kg: gramsToKg(row.grams),
      packages: Math.round(row.packages),
      valueKopecks: row.valueKopecks.toString(),
    }))
    .sort((a, b) => b.kg - a.kg);
}

export function mapProductGroupStockRows(rows: RawProductGroupStockRow[]): {
  byProductGroup: MappedProductGroupStockRow[];
  byProductGroupKg: Record<string, number>;
} {
  const byProductGroupKg: Record<string, number> = {};
  const byProductGroup = rows
    .map((row) => {
      const kg = gramsToKg(row.grams);
      const name = row.productGroup?.trim() || "Без вида";
      byProductGroupKg[name] = kg;
      return {
        productGroup: name,
        kg,
        packages: Math.round(row.packages),
        valueKopecks: row.valueKopecks.toString(),
      };
    })
    .sort((a, b) => b.kg - a.kg);

  return { byProductGroup, byProductGroupKg };
}
