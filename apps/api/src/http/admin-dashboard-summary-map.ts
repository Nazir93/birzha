import { revenueKopecksFromGramsAndPricePerKg, rubPerKgToKopecksPerKg } from "../application/units/rub-kopecks.js";

export function gramsToKg(grams: bigint | number | null | undefined): number {
  if (grams == null) {
    return 0;
  }
  return Number(grams) / 1000;
}

/** Копейки из SQL/Drizzle (bigint, string или number) — без склеивания строк. */
export function toKopecksBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return 0n;
    }
    return BigInt(trimmed);
  }
  return 0n;
}

export function sumKopecks(values: Iterable<unknown>): bigint {
  let sum = 0n;
  for (const value of values) {
    sum += toKopecksBigInt(value);
  }
  return sum;
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
  byGrade: MappedGradeStockRow[];
};

export type RawWarehouseGradeStockRow = RawWarehouseStockRow & {
  productGradeId: string;
  code: string;
  displayName: string;
  productGroup: string | null;
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

  const byGrade = rows
    .map((row) => {
      const kg = gramsToKg(row.grams);
      const packages = Math.round(row.packages);
      const valueKopecks = toKopecksBigInt(row.valueKopecks);
      stockKg += kg;
      stockPackages += packages;
      return {
        productGradeId: row.productGradeId,
        code: row.code,
        displayName: row.displayName,
        productGroup: row.productGroup,
        kg,
        packages,
        valueKopecks: valueKopecks.toString(),
      };
    })
    .sort((a, b) => b.kg - a.kg);

  const stockValueKopecks = sumKopecks(byGrade.map((row) => row.valueKopecks));

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
      valueKopecks: toKopecksBigInt(row.valueKopecks).toString(),
      byGrade: [],
    }))
    .sort((a, b) => b.kg - a.kg);
}

export function mapWarehouseWithGradeStockRows(rows: RawWarehouseGradeStockRow[]): MappedWarehouseStockRow[] {
  const byWarehouseId = new Map<
    string,
    { warehouseId: string; warehouseName: string; byGrade: MappedGradeStockRow[] }
  >();

  for (const row of rows) {
    const kg = gramsToKg(row.grams);
    const packages = Math.round(row.packages);
    if (kg <= 0 && packages <= 0) {
      continue;
    }

    let warehouse = byWarehouseId.get(row.warehouseId);
    if (!warehouse) {
      warehouse = {
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        byGrade: [],
      };
      byWarehouseId.set(row.warehouseId, warehouse);
    }

    warehouse.byGrade.push({
      productGradeId: row.productGradeId,
      code: row.code,
      displayName: row.displayName,
      productGroup: row.productGroup,
      kg,
      packages,
      valueKopecks: toKopecksBigInt(row.valueKopecks).toString(),
    });
  }

  return [...byWarehouseId.values()]
    .map((warehouse) => {
      const byGrade = warehouse.byGrade.sort((a, b) => b.kg - a.kg);
      return {
        warehouseId: warehouse.warehouseId,
        warehouseName: warehouse.warehouseName,
        kg: byGrade.reduce((sum, grade) => sum + grade.kg, 0),
        packages: byGrade.reduce((sum, grade) => sum + grade.packages, 0),
        valueKopecks: sumKopecks(byGrade.map((grade) => grade.valueKopecks)).toString(),
        byGrade,
      };
    })
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
        valueKopecks: toKopecksBigInt(row.valueKopecks).toString(),
      };
    })
    .sort((a, b) => b.kg - a.kg);

  return { byProductGroup, byProductGroupKg };
}
