import { routes } from "../routes.js";

import type { AuthUser } from "./auth-context.js";

/** Совпадает с сидом ролей в API (`0009_users_roles`). */
export type PanelId = "reports" | "nakladnaya" | "distribution" | "operations" | "offline" | "service";

/**
 * Какие глобальные роли видят раздел (см. `docs/architecture/cabinets.md`, `docs/architecture/processes/roles-and-permissions.md`).
 * `admin` всегда проходит (как на API).
 */
const PANEL_ALLOWED_ROLES: Record<PanelId, readonly string[]> = {
  /** Отчёты и рейсы — сводно по рейсу; все роли MVP. */
  reports: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller", "accountant"],
  /** Закупочная накладная — те же роли, что «Операции» (не бухгалтер). */
  nakladnaya: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  /** Распределение по качеству и направлению (шаг 3) — кладовщик, закуп, полевые; не бухгалтер. */
  distribution: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  /** Операции по партиям/рейсу — не бухгалтер (первичка не его контур в матрице панелей). */
  operations: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  /** Офлайн-очередь — полевые и склад; бухгалтер не в приоритете. */
  offline: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  /** Служебное (meta) — узкий круг; остальные через «Отчёты» и API при необходимости. */
  service: ["admin", "manager"],
};

function globalRoleCodes(user: AuthUser): Set<string> {
  return new Set(
    user.roles.filter((r) => r.scopeType === "global" && r.scopeId === "").map((r) => r.roleCode),
  );
}

export function canAccessPanel(user: AuthUser, panel: PanelId): boolean {
  const codes = globalRoleCodes(user);
  if (codes.size === 0) {
    return panel === "reports";
  }
  if (codes.has("admin")) {
    return true;
  }
  const allowed = PANEL_ALLOWED_ROLES[panel];
  return allowed.some((c) => codes.has(c));
}

export function defaultRouteForUser(user: AuthUser | null): string {
  if (!user) {
    return routes.reports;
  }
  const codes = globalRoleCodes(user);
  const startAtWarehouseIntake =
    (codes.has("warehouse") || codes.has("purchaser")) && canAccessPanel(user, "nakladnaya");
  if (startAtWarehouseIntake) {
    return routes.purchaseNakladnaya;
  }
  if (canAccessPanel(user, "reports")) {
    return routes.reports;
  }
  const order: PanelId[] = ["operations", "offline", "service"];
  for (const p of order) {
    if (canAccessPanel(user, p)) {
      if (p === "operations") {
        return routes.operations;
      }
      if (p === "offline") {
        return routes.offline;
      }
      return routes.service;
    }
  }
  return routes.reports;
}
