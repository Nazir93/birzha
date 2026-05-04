import { adminRoutes, accounting, ops, prefix, routes, sales } from "../routes.js";

import type { AuthUser } from "./auth-context.js";

export type PanelId =
  | "reports"
  | "nakladnaya"
  | "distribution"
  | "operations"
  | "offline"
  | "service"
  | "inventory"
  | "users";

/** Подписи вкладок навигации (шапка / сайдбар). */
export const NAV_PANEL_LABELS: Record<PanelId, string> = {
  nakladnaya: "Закупка товара",
  distribution: "Распределение товара",
  reports: "Отчёты и рейсы",
  operations: "Операции",
  offline: "Офлайн-очередь",
  service: "Диагностика",
  inventory: "Склады и калибры",
  users: "Сотрудники",
};

const PANEL_ALLOWED_ROLES: Record<PanelId, readonly string[]> = {
  reports: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller", "accountant"],
  /** Закуп / склад / логист; без бухгалтера и отдельного кабинета для продавца. */
  nakladnaya: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver"],
  distribution: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver"],
  operations: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  offline: ["admin", "manager", "purchaser", "warehouse", "logistics", "receiver", "seller"],
  service: ["admin"],
  /** Склады и калибры — только admin (согласовано с API). */
  inventory: ["admin"],
  /** Учётные записи (логин/роль) — как `userManagement` на API. */
  users: ["admin"],
};

const OPERATIONS_CABINET_ROLES = new Set<string>(["purchaser", "warehouse", "logistics", "receiver", "manager"]);

function globalRoleCodes(user: AuthUser): Set<string> {
  return new Set(
    user.roles.filter((r) => r.scopeType === "global" && r.scopeId === "").map((r) => r.roleCode),
  );
}

/**
 * «Только полевой продавец» — нет ролей закупа/склада/руководителя, только seller (и не admin).
 */
function isSellerOnly(codes: Set<string>): boolean {
  if (codes.size === 0) {
    return false;
  }
  if (codes.has("admin")) {
    return false;
  }
  for (const r of OPERATIONS_CABINET_ROLES) {
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

/** «Только полевой продавец» (как `isGlobalSellerOnly` в API) — в отчёте по деньгам свои продажи. */
export function isFieldSellerOnly(user: AuthUser | null): boolean {
  if (!user) {
    return false;
  }
  return isSellerOnly(globalRoleCodes(user));
}

export type CabinetId = "admin" | "operations" | "sales" | "accounting";

/**
 * Склады/калибры POST/DELETE (как на API `inventoryCatalogWrite`). UI: админ-кабинет.
 */
export function canManageInventoryCatalog(user: AuthUser): boolean {
  const codes = globalRoleCodes(user);
  return codes.has("admin");
}

/** Создание/удаление рейса — как `TRIP_WRITE` в API: admin, manager, logistics. */
const TRIP_WRITE_ROLES = new Set<string>(["admin", "manager", "logistics"]);

export function canCreateTrip(user: AuthUser | null): boolean {
  if (!user) {
    return false;
  }
  const codes = globalRoleCodes(user);
  for (const r of TRIP_WRITE_ROLES) {
    if (codes.has(r)) {
      return true;
    }
  }
  return false;
}

/** Создание/удаление в справочнике контрагентов — как `CATALOG_WRITE_ROLES` в API. */
const COUNTERPARTY_WRITE_ROLES = new Set<string>(["admin", "manager", "accountant"]);

export function canWriteCounterpartyCatalog(user: AuthUser | null): boolean {
  if (!user) {
    return false;
  }
  const codes = globalRoleCodes(user);
  for (const r of COUNTERPARTY_WRITE_ROLES) {
    if (codes.has(r)) {
      return true;
    }
  }
  return false;
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

export function hasOperationsCabinetAccess(user: AuthUser): boolean {
  const codes = globalRoleCodes(user);
  if (codes.has("admin")) {
    return true;
  }
  for (const r of OPERATIONS_CABINET_ROLES) {
    if (codes.has(r)) {
      return true;
    }
  }
  return false;
}

export function canAccessCabinet(user: AuthUser, id: CabinetId): boolean {
  const codes = globalRoleCodes(user);
  if (codes.has("admin")) {
    return true;
  }
  if (id === "admin") {
    return false;
  }
  if (id === "operations") {
    if (isSellerOnly(codes)) {
      return false;
    }
    if (codes.has("accountant") && !canManageInventoryCatalog(user)) {
      return false;
    }
    if (codes.has("seller") && !codes.has("purchaser") && !codes.has("warehouse") && !codes.has("logistics") && !codes.has("receiver")) {
      if (!codes.has("manager")) {
        return false;
      }
    }
    return hasOperationsCabinetAccess(user);
  }
  if (id === "sales") {
    if (isSellerOnly(codes)) {
      return true;
    }
    if (hasOperationsCabinetAccess(user) && !codes.has("seller")) {
      return false;
    }
    if (hasOperationsCabinetAccess(user) && codes.has("seller")) {
      return true;
    }
    return false;
  }
  if (id === "accounting") {
    return codes.has("accountant");
  }
  return false;
}

export function cabinetForUser(user: AuthUser | null): CabinetId {
  if (!user) {
    return "operations";
  }
  const codes = globalRoleCodes(user);
  if (codes.has("admin")) {
    return "admin";
  }
  if (isSellerOnly(codes)) {
    return "sales";
  }
  if (hasOperationsCabinetAccess(user)) {
    return "operations";
  }
  if (codes.has("accountant")) {
    return "accounting";
  }
  if (codes.has("seller")) {
    return "sales";
  }
  return "operations";
}

export function cabinetIdFromPathname(pathname: string): CabinetId | null {
  if (pathname === prefix.admin || pathname.startsWith(`${prefix.admin}/`)) {
    return "admin";
  }
  if (pathname === prefix.operations || pathname.startsWith(`${prefix.operations}/`)) {
    return "operations";
  }
  if (pathname === prefix.sales || pathname.startsWith(`${prefix.sales}/`)) {
    return "sales";
  }
  if (pathname === prefix.accounting || pathname.startsWith(`${prefix.accounting}/`)) {
    return "accounting";
  }
  return null;
}

/**
 * Href панели с учётом кабинета. Если панель в этом кабинете не показывается — null.
 */
/** Порядок вкладок в `/o` и в админке для блоков операций: у логиста «Отчёты и рейсы» первыми. */
export function operationsPanelOrder(user: AuthUser | null): PanelId[] {
  const base: PanelId[] = [
    "nakladnaya",
    "distribution",
    "reports",
    "operations",
    "offline",
    "inventory",
    "users",
    "service",
  ];
  if (!user) {
    return base;
  }
  const codes = globalRoleCodes(user);
  /** Только полевой продавец: продажа на `/s`, без второй вкладки «Операции» (дубль формы). */
  if (isSellerOnly(codes)) {
    return ["reports", "offline"];
  }
  if (codes.has("logistics")) {
    const rest = base.filter((p) => p !== "reports");
    return ["reports", ...rest];
  }
  return base;
}

export function hrefForPanelInCabinet(
  user: AuthUser,
  panel: PanelId,
  currentCabinet: CabinetId,
): string | null {
  if (!canAccessPanel(user, panel)) {
    return null;
  }
  if (!canAccessCabinet(user, currentCabinet)) {
    return null;
  }
  if (currentCabinet === "accounting" && panel === "reports") {
    return accounting.reports;
  }
  if (currentCabinet === "admin") {
    if (panel === "inventory") {
      return adminRoutes.inventory;
    }
    if (panel === "users") {
      return adminRoutes.users;
    }
    if (panel === "service") {
      return adminRoutes.service;
    }
    if (panel === "nakladnaya") {
      return canAccessPanel(user, "nakladnaya") ? adminRoutes.purchaseNakladnaya : null;
    }
    if (panel === "reports") {
      return adminRoutes.reports;
    }
    if (panel === "distribution") {
      return adminRoutes.distribution;
    }
    if (panel === "operations") {
      return adminRoutes.operations;
    }
    if (panel === "offline") {
      return adminRoutes.offline;
    }
  }
  if (currentCabinet === "operations") {
    if (panel === "reports") {
      return ops.reports;
    }
    if (panel === "nakladnaya") {
      return canAccessPanel(user, "nakladnaya") ? ops.purchaseNakladnaya : null;
    }
    if (panel === "distribution") {
      return ops.distribution;
    }
    if (panel === "operations") {
      return ops.operations;
    }
    if (panel === "offline") {
      return ops.offline;
    }
    if (panel === "inventory" && canManageInventoryCatalog(user)) {
      return adminRoutes.inventory;
    }
    if (panel === "users" && canAccessPanel(user, "users")) {
      return adminRoutes.users;
    }
    if (panel === "service" && canAccessPanel(user, "service")) {
      return adminRoutes.service;
    }
  }
  if (currentCabinet === "sales") {
    if (panel === "reports") {
      return sales.reports;
    }
    if (panel === "operations") {
      return sales.operations;
    }
    if (panel === "offline") {
      return sales.offline;
    }
  }
  if (currentCabinet === "accounting") {
    if (panel === "reports") {
      return accounting.reports;
    }
  }
  return null;
}

export function defaultRouteForUser(user: AuthUser | null): string {
  if (!user) {
    return ops.reports;
  }
  const c = cabinetForUser(user);
  if (c === "admin") {
    return adminRoutes.home;
  }
  if (c === "operations") {
    const codes = globalRoleCodes(user);
    if ((codes.has("warehouse") || codes.has("purchaser")) && canAccessPanel(user, "nakladnaya")) {
      return ops.purchaseNakladnaya;
    }
    return ops.reports;
  }
  if (c === "sales") {
    return sales.home;
  }
  if (c === "accounting") {
    return accounting.home;
  }
  return ops.reports;
}

export type LegacySegment = keyof typeof routes.legacy;

/** Куда вести со старого пути (без префикса кабинета). */
export function canonicalPathForLegacy(legacy: LegacySegment, user: AuthUser | null): string {
  if (!user) {
    if (legacy === "service") {
      return adminRoutes.service;
    }
    return {
      reports: ops.reports,
      purchaseNakladnaya: ops.purchaseNakladnaya,
      distribution: ops.distribution,
      operations: ops.operations,
      offline: ops.offline,
      service: adminRoutes.service,
    }[legacy];
  }
  if (legacy === "service") {
    return adminRoutes.service;
  }
  if (legacy === "reports") {
    if (cabinetForUser(user) === "accounting") {
      return accounting.home;
    }
    if (cabinetForUser(user) === "sales") {
      return sales.home;
    }
    return ops.reports;
  }
  if (legacy === "purchaseNakladnaya") {
    return ops.purchaseNakladnaya;
  }
  if (legacy === "distribution") {
    return ops.distribution;
  }
  if (legacy === "operations") {
    if (!canAccessPanel(user, "operations")) {
      return defaultRouteForUser(user);
    }
    if (cabinetForUser(user) === "sales") {
      return sales.operations;
    }
    return ops.operations;
  }
  if (legacy === "offline") {
    if (!canAccessPanel(user, "offline")) {
      return defaultRouteForUser(user);
    }
    if (cabinetForUser(user) === "sales") {
      return sales.offline;
    }
    return ops.offline;
  }
  return routes.legacy[legacy];
}
