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

/** Угол от 12 часов по часовой стрелке (0–360), как в CSS conic-gradient. */
export function massRingPointerAngleDeg(clientX: number, clientY: number, rect: DOMRect): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  return (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
}

/** Курсор на кольце (не в «дырке» по центру). inset — как inset у `.birzha-admin-mass-ring__hole`. */
export function isMassRingPointerOnDonut(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  holeInsetRatio = 0.24,
): boolean {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dist = Math.hypot(clientX - cx, clientY - cy);
  const outerR = Math.min(rect.width, rect.height) / 2;
  const innerR = outerR * (1 - holeInsetRatio * 2);
  return dist >= innerR && dist <= outerR;
}

export function massSegmentAtRingAngle(segments: MassSegment[], angleDeg: number): MassSegment | null {
  const total = segments.reduce((sum, row) => sum + row.kg, 0);
  if (total <= 0) {
    return null;
  }
  let cum = 0;
  for (const seg of segments) {
    const span = (seg.kg / total) * 360;
    if (span <= 0) {
      continue;
    }
    if (angleDeg >= cum && angleDeg < cum + span) {
      return seg;
    }
    cum += span;
  }
  const last = [...segments].reverse().find((row) => row.kg > 0);
  return last ?? null;
}
