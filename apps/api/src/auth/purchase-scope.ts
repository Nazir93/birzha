import type { PurchaseDocumentSummary } from "../application/ports/purchase-document-repository.port.js";
import { globalRoleCodes } from "./global-roles.js";
import type { AuthRoleGrant } from "./role-grant.js";

export type PurchaseDocWithPurchaser = {
  createdByUserId: string | null;
  purchaserUserId?: string | null;
};

/** Эффективный закупщик: явное поле, иначе автор ввода (старые строки). */
export function effectivePurchasePurchaserUserId(doc: PurchaseDocWithPurchaser): string | null {
  const p = doc.purchaserUserId?.trim();
  if (p) {
    return p;
  }
  const c = doc.createdByUserId?.trim();
  return c && c.length > 0 ? c : null;
}

/**
 * Список накладных для глобального закупщика: свои (по purchaser / fallback author) + без закупщика.
 * Без `user` / `userId` (dev без JWT) — без доп. фильтра.
 */
export function filterPurchaseSummariesForPurchaserScope(
  docs: PurchaseDocumentSummary[],
  user: { roles: AuthRoleGrant[] } | undefined,
  userId: string | undefined,
): PurchaseDocumentSummary[] {
  if (!user || !userId) {
    return docs;
  }
  const globals = globalRoleCodes(user);
  if (globals.includes("admin") || globals.includes("manager")) {
    return docs;
  }
  if (globals.includes("purchaser")) {
    return docs.filter((d) => {
      const pid = effectivePurchasePurchaserUserId(d);
      return pid == null || pid === userId;
    });
  }
  return docs;
}

export function purchaseDocumentReadableByPurchaser(
  doc: PurchaseDocumentSummary | PurchaseDocWithPurchaser,
  user: { roles: AuthRoleGrant[] },
  userId: string,
): boolean {
  const globals = globalRoleCodes(user);
  if (globals.includes("admin") || globals.includes("manager")) {
    return true;
  }
  if (globals.includes("purchaser")) {
    const pid = effectivePurchasePurchaserUserId(doc);
    return pid == null || pid === userId;
  }
  return true;
}
