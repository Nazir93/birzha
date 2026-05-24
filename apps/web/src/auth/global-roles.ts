import type { AuthUser } from "./auth-context.js";

/** Глобальная роль (scope пустой), как на API. */
export function hasGlobalRole(user: AuthUser | null, role: string): boolean {
  if (!user) {
    return false;
  }
  return user.roles.some((r) => r.roleCode === role && r.scopeType === "global" && r.scopeId === "");
}

export function globalRoleCodes(user: AuthUser | null): Set<string> {
  if (!user) {
    return new Set();
  }
  return new Set(
    user.roles.filter((r) => r.scopeType === "global" && r.scopeId === "").map((r) => r.roleCode),
  );
}
