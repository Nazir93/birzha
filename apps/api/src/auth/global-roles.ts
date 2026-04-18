import type { AuthRoleGrant } from "./role-grant.js";

/** Коды ролей MVP (сид `0009_users_roles`). */
export const MVP_ROLE_CODES = [
  "admin",
  "manager",
  "purchaser",
  "warehouse",
  "logistics",
  "receiver",
  "seller",
  "accountant",
] as const;

export type MvpRoleCode = (typeof MVP_ROLE_CODES)[number];

/** Глобальная роль в JWT: `scope_type === global` и пустой `scope_id`. */
export function globalRoleCodes(user: { roles: AuthRoleGrant[] }): string[] {
  return user.roles.filter((r) => r.scopeType === "global" && r.scopeId === "").map((r) => r.roleCode);
}

/** `admin` даёт полный доступ к проверкам ниже. */
export function hasAnyGlobalRole(user: { roles: AuthRoleGrant[] }, allowed: readonly string[]): boolean {
  const globals = globalRoleCodes(user);
  if (globals.includes("admin")) {
    return true;
  }
  const allow = new Set(allowed);
  return globals.some((code) => allow.has(code));
}
