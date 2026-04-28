import type { AuthRoleGrant } from "./role-grant.js";
import { globalRoleCodes } from "./global-roles.js";

/**
 * Если вернуть не-`null`, списки партий и накладных на чтение нужно ограничить этими `warehouse_id`.
 * `null` — без ограничения по складу (админ, менеджер, или роли без warehouse-scope).
 */
export function warehouseReadScopeIds(user: { roles: AuthRoleGrant[] }): Set<string> | null {
  const globals = globalRoleCodes(user);
  if (globals.includes("admin") || globals.includes("manager")) {
    return null;
  }

  const ids = new Set<string>();
  for (const r of user.roles) {
    if (r.scopeType !== "warehouse" || !r.scopeId?.trim()) {
      continue;
    }
    if (r.roleCode === "warehouse" || r.roleCode === "receiver") {
      ids.add(r.scopeId.trim());
    }
  }
  if (ids.size === 0) {
    return null;
  }
  return ids;
}
