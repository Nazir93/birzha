import type { WarehouseWriteOffsRecentResponse } from "../api/types.js";

export type SelectionReturnRow = {
  writeOffId: string;
  kg: number;
  packageCount: number | null;
  label: string;
};

type LedgerLine = WarehouseWriteOffsRecentResponse["lines"][number];

function selectionReturnLabel(line: LedgerLine): string {
  const parts: string[] = [];
  const supplier = line.supplierName?.trim();
  if (supplier) {
    parts.push(supplier);
  }
  const num = line.documentNumber?.trim();
  if (num) {
    parts.push(`№ ${num}`);
  }
  const grade = line.productGradeCode?.trim();
  if (grade) {
    parts.push(grade);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** Строки журнала возвратов из отбора → таблица «Возвраты из отбора» (новые сверху, как отдаёт API). */
export function selectionReturnRowsFromLedger(lines: readonly LedgerLine[]): SelectionReturnRow[] {
  return lines.map((line) => ({
    writeOffId: line.id,
    kg: line.kg,
    packageCount: line.packageCount,
    label: selectionReturnLabel(line),
  }));
}
