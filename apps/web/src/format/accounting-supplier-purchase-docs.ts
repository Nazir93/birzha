import type { PurchaseDocumentSummary } from "../api/types.js";

export type SupplierPurchaseDocsGroup = {
  key: string;
  supplierId: string | null;
  supplierName: string;
  documents: PurchaseDocumentSummary[];
  totalKg: number;
  totalKopecks: bigint;
};

function docTotalKopecks(doc: PurchaseDocumentSummary): bigint {
  if (doc.documentTotalKopecks != null && doc.documentTotalKopecks !== "") {
    return BigInt(doc.documentTotalKopecks);
  }
  const lines = doc.linesTotalKopecks != null && doc.linesTotalKopecks !== "" ? BigInt(doc.linesTotalKopecks) : 0n;
  const extra = doc.extraCostKopecks != null && doc.extraCostKopecks !== "" ? BigInt(doc.extraCostKopecks) : 0n;
  return lines + extra;
}

/**
 * Группировка закупочных накладных по тепличнику для кабинета бухгалтера.
 */
export function groupPurchaseDocumentsBySupplier(
  docs: readonly PurchaseDocumentSummary[],
): SupplierPurchaseDocsGroup[] {
  const map = new Map<string, SupplierPurchaseDocsGroup>();
  for (const doc of docs) {
    const name = doc.supplierName?.trim() || "Без тепличника";
    const sid = doc.supplierId?.trim() || null;
    const key = sid ? `id:${sid}` : `name:${name.toLowerCase()}`;
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        supplierId: sid,
        supplierName: name,
        documents: [],
        totalKg: 0,
        totalKopecks: 0n,
      };
      map.set(key, group);
    }
    group.documents.push(doc);
    group.totalKg += doc.totalKg ?? 0;
    group.totalKopecks += docTotalKopecks(doc);
  }
  for (const g of map.values()) {
    g.documents.sort((a, b) => {
      const byDate = b.docDate.localeCompare(a.docDate);
      if (byDate !== 0) {
        return byDate;
      }
      return a.documentNumber.localeCompare(b.documentNumber, "ru");
    });
  }
  return [...map.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "ru"));
}
