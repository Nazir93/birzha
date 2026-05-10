import { nonnegativeDecimalStringToNumber } from "@birzha/contracts";

import type { BatchListItem, PurchaseDocumentLineDetail } from "../api/types.js";
import {
  linePackageCountForNakladnayaSum,
  lineTotalKopecksForNakladnayaSum,
} from "../validation/api-schemas.js";

export type PurchaseDocumentTotalsByGradeRow = {
  gradeCode: string;
  totalKg: number;
  totalPackages: number;
  lineKopSum: number;
};

/** Сводка по строкам закупочной накладной (детальный `GET /purchase-documents/:id`). */
export function totalsByGradeFromPurchaseDocumentLines(
  lines: readonly PurchaseDocumentLineDetail[],
): PurchaseDocumentTotalsByGradeRow[] {
  const map = new Map<string, { totalKg: number; totalPackages: number; lineKopSum: number }>();
  for (const line of lines) {
    const code = line.productGradeCode.trim() || "—";
    const cur = map.get(code) ?? { totalKg: 0, totalPackages: 0, lineKopSum: 0 };
    cur.totalKg += line.totalKg;
    cur.totalPackages += linePackageCountForNakladnayaSum(line.packageCount ?? "");
    cur.lineKopSum += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    map.set(code, cur);
  }
  return [...map.entries()]
    .map(([gradeCode, v]) => ({ gradeCode, ...v }))
    .sort((a, b) => a.gradeCode.localeCompare(b.gradeCode, "ru", { numeric: true }));
}

export type NakladnayaFormLineDraft = {
  productGradeId: string;
  totalKg: string;
  packageCount: string;
  lineTotalKopecks: string;
};

export type NakladnayaFormTotalsByGradeRow = {
  gradeKey: string;
  label: string;
  totalKg: number;
  totalPackages: number;
  lineKopSum: number;
};

/** Сводка по черновику строк формы создания накладной (группировка по `productGradeId`). */
export function totalsByGradeFromNakladnayaFormLines(
  lines: readonly NakladnayaFormLineDraft[],
  gradeLabelForId: (productGradeId: string) => string,
): NakladnayaFormTotalsByGradeRow[] {
  const map = new Map<string, { label: string; totalKg: number; totalPackages: number; lineKopSum: number }>();
  for (const line of lines) {
    const id = line.productGradeId.trim();
    const gradeKey = id || "__unselected__";
    const label = gradeLabelForId(id);
    const cur = map.get(gradeKey) ?? { label, totalKg: 0, totalPackages: 0, lineKopSum: 0 };
    const kg = nonnegativeDecimalStringToNumber(line.totalKg, 6);
    if (Number.isFinite(kg) && kg > 0) {
      cur.totalKg += kg;
    }
    cur.totalPackages += linePackageCountForNakladnayaSum(line.packageCount);
    cur.lineKopSum += lineTotalKopecksForNakladnayaSum(line.lineTotalKopecks);
    map.set(gradeKey, cur);
  }
  return [...map.entries()]
    .map(([gradeKey, v]) => ({ gradeKey, ...v }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true }));
}

export type BatchesNakladnayaTotalsByGradeRow = {
  gradeCode: string;
  onWarehouseKg: number;
  inTransitKg: number;
  soldKg: number;
  pendingInboundKg: number;
};

/** Суммы кг по калибру для партий, пришедших из строк накладной. */
export function totalsByGradeFromNakladnayaBatches(
  batches: readonly BatchListItem[],
): BatchesNakladnayaTotalsByGradeRow[] {
  const map = new Map<
    string,
    { onWarehouseKg: number; inTransitKg: number; soldKg: number; pendingInboundKg: number }
  >();
  for (const b of batches) {
    const code = (b.nakladnaya?.productGradeCode ?? "").trim() || "—";
    const cur = map.get(code) ?? { onWarehouseKg: 0, inTransitKg: 0, soldKg: 0, pendingInboundKg: 0 };
    cur.onWarehouseKg += b.onWarehouseKg;
    cur.inTransitKg += b.inTransitKg;
    cur.soldKg += b.soldKg;
    cur.pendingInboundKg += b.pendingInboundKg;
    map.set(code, cur);
  }
  return [...map.entries()]
    .map(([gradeCode, v]) => ({ gradeCode, ...v }))
    .sort((a, b) => a.gradeCode.localeCompare(b.gradeCode, "ru", { numeric: true }));
}
