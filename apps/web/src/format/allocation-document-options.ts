import { compareProductGradeCodes } from "@birzha/contracts";

import type { BatchListItem } from "../api/types.js";
import { batchAvailableForLoadingKg } from "./batch-available-for-loading.js";

const STOCK_EPS_KG = 1e-6;

export type AllocationDocumentOption = {
  id: string;
  number: string;
  checkboxLabel: string;
};

type DocAgg = {
  number: string;
  grades: Set<string>;
  suppliers: Set<string>;
  destinations: Set<string>;
};

function destinationLabel(code: string, labelDest?: Record<string, string>): string {
  const c = code.trim();
  if (!c) {
    return "";
  }
  return labelDest?.[c]?.trim() || c;
}

/** Подпись чекбокса: тепличник · № · калибры (если дубль) → куда грузить. */
export function formatAllocationDocumentCheckboxLabel(input: {
  number: string;
  suppliers: readonly string[];
  destinations: readonly string[];
  gradeHint: string;
  duplicateNumber: boolean;
}): string {
  const num = input.number.trim() || "без номера";
  const parts: string[] = [];
  const supplier = input.suppliers.filter(Boolean).join(", ");
  if (supplier) {
    parts.push(supplier);
  }
  const numPart =
    input.duplicateNumber && input.gradeHint ? `№ ${num} · ${input.gradeHint}` : `№ ${num}`;
  parts.push(numPart);
  const head = parts.join(" · ");
  const dest = input.destinations.filter(Boolean).join(", ");
  return dest ? `${head} → ${dest}` : head;
}

/** Подпись документа по партиям одной накладной (та же формула, что у галочек отбора). */
export function purchaseDocumentLabelFromBatches(
  batches: readonly BatchListItem[],
  fallback: { documentId?: string | null; documentNumber?: string | null },
  labelDest?: Record<string, string>,
): string {
  const number =
    batches.map((b) => b.nakladnaya?.documentNumber?.trim()).find(Boolean) ||
    fallback.documentNumber?.trim() ||
    "";
  const suppliers = new Set<string>();
  const destinations = new Set<string>();
  const grades = new Set<string>();
  for (const b of batches) {
    const supplier = b.nakladnaya?.supplierName?.trim();
    if (supplier) {
      suppliers.add(supplier);
    }
    const destCode = b.allocation?.destination?.trim();
    if (destCode) {
      const dest = destinationLabel(destCode, labelDest);
      if (dest) {
        destinations.add(dest);
      }
    }
    const grade = b.nakladnaya?.productGradeCode?.trim();
    if (grade) {
      grades.add(grade);
    }
  }
  if (!number && suppliers.size === 0 && destinations.size === 0) {
    const id = fallback.documentId?.trim() ?? "";
    if (id) {
      return `№ …${id.slice(-6)}`;
    }
    return "Без накладной в данных";
  }
  return formatAllocationDocumentCheckboxLabel({
    number: number || "без номера",
    suppliers: [...suppliers].sort((a, b) => a.localeCompare(b, "ru")),
    destinations: [...destinations].sort((a, b) => a.localeCompare(b, "ru")),
    gradeHint: [...grades].sort(compareProductGradeCodes).join(", "),
    duplicateNumber: false,
  });
}

/** Закупочные накладные для чекбоксов отбора: только с documentId и доступным остатком. */
export function documentOptionsForAllocation(
  batches: readonly BatchListItem[],
  labelDest?: Record<string, string>,
): AllocationDocumentOption[] {
  const byDoc = new Map<string, DocAgg>();
  for (const b of batches) {
    if (batchAvailableForLoadingKg(b) <= STOCK_EPS_KG) {
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
        suppliers: new Set(),
        destinations: new Set(),
      };
      byDoc.set(d, entry);
    }
    const code = b.nakladnaya?.productGradeCode?.trim();
    if (code) {
      entry.grades.add(code);
    }
    const supplier = b.nakladnaya?.supplierName?.trim();
    if (supplier) {
      entry.suppliers.add(supplier);
    }
    const destCode = b.allocation?.destination?.trim();
    if (destCode) {
      const dest = destinationLabel(destCode, labelDest);
      if (dest) {
        entry.destinations.add(dest);
      }
    }
  }
  const base = [...byDoc.entries()]
    .map(([id, agg]) => ({ id, ...agg }))
    .sort((a, b) => a.number.localeCompare(b.number, "ru"));
  const byNumberCount = new Map<string, number>();
  for (const o of base) {
    byNumberCount.set(o.number, (byNumberCount.get(o.number) ?? 0) + 1);
  }
  return base.map((o) => {
    const duplicateNumber = (byNumberCount.get(o.number) ?? 0) > 1;
    const gradeHint = [...o.grades].sort(compareProductGradeCodes).join(", ");
    const checkboxLabel = formatAllocationDocumentCheckboxLabel({
      number: o.number,
      suppliers: [...o.suppliers].sort((a, b) => a.localeCompare(b, "ru")),
      destinations: [...o.destinations].sort((a, b) => a.localeCompare(b, "ru")),
      gradeHint,
      duplicateNumber,
    });
    return { id: o.id, number: o.number, checkboxLabel };
  });
}
