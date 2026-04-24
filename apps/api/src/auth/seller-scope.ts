import type { AuthRoleGrant } from "./role-grant.js";

const OPERATIONS_CABINET = new Set<string>(["purchaser", "warehouse", "logistics", "receiver", "manager"]);

/**
 * Глобальные коды, как `globalRoleCodes`, но в виде `Set` для сравнения с `apps/web` `isSellerOnly`.
 * Только `seller` без admin/manager и без закуп-склада-логиста — отчёт по продаже (деньги) в разрезе своих строк.
 */
export function isGlobalSellerOnly(roles: AuthRoleGrant[]): boolean {
  const codes = new Set(
    roles.filter((r) => r.scopeType === "global" && r.scopeId === "").map((r) => r.roleCode),
  );
  if (codes.size === 0) {
    return false;
  }
  if (codes.has("admin")) {
    return false;
  }
  for (const r of OPERATIONS_CABINET) {
    if (r !== "manager" && codes.has(r)) {
      return false;
    }
  }
  if (codes.has("manager")) {
    return false;
  }
  if (codes.has("accountant") || codes.has("receiver") || codes.has("logistics")) {
    return false;
  }
  return codes.has("seller");
}
