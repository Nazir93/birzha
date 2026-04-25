import type { BatchListItem } from "../api/types.js";

/** Партия учитывается только «по накладной» — id документа и склад в строке закупки. */
export function isFromPurchaseNakladnaya(b: BatchListItem): boolean {
  const n = b.nakladnaya;
  return Boolean(
    n &&
      String(n.documentId ?? "").trim() &&
      String(n.warehouseId ?? "").trim(),
  );
}
