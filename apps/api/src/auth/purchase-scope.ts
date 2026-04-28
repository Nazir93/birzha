import type { PurchaseDocumentSummary } from "../application/ports/purchase-document-repository.port.js";
import { globalRoleCodes } from "./global-roles.js";
import type { AuthRoleGrant } from "./role-grant.js";

export type PurchaseDocWithCreator = { createdByUserId: string | null };

/**
 * Список накладных для глобального закупщика: свои + без автора (миграция/старые данные).
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
    return docs.filter((d) => d.createdByUserId == null || d.createdByUserId === userId);
  }
  return docs;
}

export function purchaseDocumentReadableByPurchaser(
  doc: PurchaseDocumentSummary | PurchaseDocWithCreator,
  user: { roles: AuthRoleGrant[] },
  userId: string,
): boolean {
  const globals = globalRoleCodes(user);
  if (globals.includes("admin") || globals.includes("manager")) {
    return true;
  }
  if (globals.includes("purchaser")) {
    return doc.createdByUserId == null || doc.createdByUserId === userId;
  }
  return true;
}
