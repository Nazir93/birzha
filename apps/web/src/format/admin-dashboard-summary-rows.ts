import type {
  DashboardGradeStockRow,
  DashboardProductGroupStockRow,
  DashboardWarehouseStockRow,
} from "../api/types.js";
import { productGradeOptionLabel } from "./batch-label.js";

export type SummaryTableRow = {
  key: string;
  label: string;
  sublabel?: string | null;
  kg: number;
  packages: number;
  valueKopecks: string;
};

export function gradeTableRows(rows: DashboardGradeStockRow[]): SummaryTableRow[] {
  return rows.map((row) => ({
    key: row.productGradeId,
    label: productGradeOptionLabel(row.code, row.displayName),
    sublabel: row.productGroup,
    kg: row.kg,
    packages: row.packages,
    valueKopecks: row.valueKopecks,
  }));
}

export function warehouseTableRows(rows: DashboardWarehouseStockRow[]): SummaryTableRow[] {
  return rows.map((row) => ({
    key: row.warehouseId,
    label: row.warehouseName?.trim() || row.warehouseId,
    sublabel: null,
    kg: row.kg,
    packages: row.packages,
    valueKopecks: row.valueKopecks,
  }));
}

export function productGroupTableRows(rows: DashboardProductGroupStockRow[]): SummaryTableRow[] {
  return rows.map((row) => ({
    key: row.productGroup,
    label: row.productGroup,
    sublabel: null,
    kg: row.kg,
    packages: row.packages,
    valueKopecks: row.valueKopecks,
  }));
}

export type MassSegment = {
  label: string;
  kg: number;
  fillClass: string;
};

export function buildMassSegments(input: {
  warehouseKg: number;
  loadingManifestKg: number;
  inTripRemainingKg: number;
  soldKg: number;
}): MassSegment[] {
  return [
    { label: "На складе", kg: input.warehouseKg, fillClass: "birzha-admin-dash-modern__bar-fill--wh" },
    { label: "Погрузка", kg: input.loadingManifestKg, fillClass: "birzha-admin-dash-modern__bar-fill--lm" },
    { label: "В рейсе", kg: input.inTripRemainingKg, fillClass: "birzha-admin-dash-modern__bar-fill--tr" },
    { label: "Продано", kg: input.soldKg, fillClass: "birzha-admin-dash-modern__bar-fill--sl" },
  ];
}

export function summaryTableMaxKg(rows: SummaryTableRow[]): number {
  return rows[0]?.kg ?? 0;
}
