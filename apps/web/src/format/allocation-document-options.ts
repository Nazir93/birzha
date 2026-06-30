import type { BatchListItem } from "../api/types.js";

const STOCK_EPS_KG = 1e-6;

export type AllocationDocumentOption = {
  id: string;
  number: string;
  checkboxLabel: string;
};

/** Закупочные накладные для чекбоксов отбора: только с documentId и остатком на складе. */
export function documentOptionsForAllocation(batches: BatchListItem[]): AllocationDocumentOption[] {
  const byDoc = new Map<string, { number: string; grades: Set<string> }>();
  for (const b of batches) {
    if (b.onWarehouseKg <= STOCK_EPS_KG) {
      continue;
    }
    const d = b.nakladnaya?.documentId?.trim();
    if (!d) {
      continue;
    }
    let entry = byDoc.get(d);
    if (!entry) {
      entry = {
        number: b.nakladnaya?.documentNumber?.trim() || "без номера",
        grades: new Set(),
      };
      byDoc.set(d, entry);
    }
    const code = b.nakladnaya?.productGradeCode?.trim();
    if (code) {
      entry.grades.add(code);
    }
  }
  const base = [...byDoc.entries()]
    .map(([id, { number, grades }]) => ({ id, number, grades }))
    .sort((a, b) => a.number.localeCompare(b.number, "ru"));
  const byNumberCount = new Map<string, number>();
  for (const o of base) {
    byNumberCount.set(o.number, (byNumberCount.get(o.number) ?? 0) + 1);
  }
  return base.map((o) => {
    const dup = (byNumberCount.get(o.number) ?? 0) > 1;
    const gradeHint = [...o.grades].sort((a, b) => a.localeCompare(b, "ru")).join(", ");
    const checkboxLabel = dup && gradeHint ? `№ ${o.number} · ${gradeHint}` : `№ ${o.number}`;
    return { id: o.id, number: o.number, checkboxLabel };
  });
}
