import type { AuthUser } from "./auth-context.js";
import {
  canAccessCabinet,
  hrefForPanelInCabinet,
  isFieldSellerOnly,
  NAV_PANEL_LABELS,
  adminSidebarPanelOrder,
  operationsPanelOrder,
  type CabinetId,
} from "./role-panels.js";
import { accounting, adminRoutes, ops, prefix, sales } from "../routes.js";

export type CabinetNavEntry = { to: string; label: string; key: string };

const ANON_OPS: CabinetNavEntry[] = [
  { key: "nakl", to: ops.purchaseNakladnaya, label: NAV_PANEL_LABELS.nakladnaya },
  { key: "dist", to: ops.distribution, label: NAV_PANEL_LABELS.distribution },
  { key: "trips", to: ops.trips, label: NAV_PANEL_LABELS.trips },
  { key: "rep", to: ops.reports, label: NAV_PANEL_LABELS.reports },
  { key: "op", to: ops.operations, label: NAV_PANEL_LABELS.operations },
  { key: "archive", to: ops.archive, label: NAV_PANEL_LABELS.archive },
];

const ANON_ADMIN_OPS: CabinetNavEntry[] = [
  { key: "nakl", to: adminRoutes.purchaseNakladnaya, label: NAV_PANEL_LABELS.nakladnaya },
  { key: "dist", to: adminRoutes.distribution, label: NAV_PANEL_LABELS.distribution },
  { key: "trips", to: adminRoutes.trips, label: NAV_PANEL_LABELS.trips },
  { key: "lm", to: adminRoutes.loadingManifests, label: NAV_PANEL_LABELS.loadingManifests },
  { key: "rep", to: adminRoutes.reports, label: NAV_PANEL_LABELS.reports },
  { key: "op", to: adminRoutes.operations, label: NAV_PANEL_LABELS.operations },
  { key: "archive", to: adminRoutes.archive, label: NAV_PANEL_LABELS.archive },
];

/** Архив — отдельно внизу сайдбара (остальные пункты выше). */
export function splitCabinetNavForSidebar(entries: CabinetNavEntry[]): {
  main: CabinetNavEntry[];
  bottom: CabinetNavEntry[];
} {
  const bottom = entries.filter((e) => e.key === "archive");
  const main = entries.filter((e) => e.key !== "archive");
  return { main, bottom };
}

/**
 * Пункты бокового меню кабинета (как в прежнем `AppNav`, без дублирования логики).
 */
export function buildCabinetNavEntries(
  cabinet: CabinetId,
  user: AuthUser | null,
  authRestricted: boolean,
): CabinetNavEntry[] {
  if (!user || !authRestricted) {
    if (cabinet === "admin") {
      return [{ to: adminRoutes.home, label: "Сводка", key: "home" }, ...ANON_ADMIN_OPS];
    }
    return [...ANON_OPS];
  }

  const out: CabinetNavEntry[] = [];
  if (cabinet === "admin") {
    out.push({ to: adminRoutes.home, label: "Сводка", key: "admin-home" });
  }
  if (cabinet === "sales") {
    out.push({
      to: sales.home,
      label: isFieldSellerOnly(user) ? "Продажа" : "Сводка",
      key: "sales-home",
    });
  }
  if (cabinet === "accounting") {
    out.push({ to: accounting.home, label: "Сводка", key: "acc-home" });
    out.push({ to: accounting.reports, label: "Отчёт по рейсу", key: "acc-reports" });
    out.push({ to: accounting.counterparties, label: "Контрагенты", key: "acc-cp" });
    return out;
  }
  const panelOrder = cabinet === "admin" ? adminSidebarPanelOrder(user) : operationsPanelOrder(user);
  for (const p of panelOrder) {
    const to = hrefForPanelInCabinet(user, p, cabinet);
    if (to) {
      const label =
        cabinet === "sales" && p === "reports"
          ? isFieldSellerOnly(user)
            ? "Отчёт по рейсу"
            : "Отчёты по рейсу"
          : NAV_PANEL_LABELS[p];
      out.push({ to, label, key: p });
    }
  }
  if (cabinet === "admin" && user && authRestricted && canAccessCabinet(user, "accounting")) {
    out.push({ to: accounting.home, label: "Бухгалтерия", key: "jump-accounting" });
  }
  return out;
}

/** Для `NavLink` `end`: только «корень» кабинетов с отдельной сводкой. */
export function cabinetNavLinkUsesEnd(cabinet: CabinetId, to: string): boolean {
  if (cabinet === "admin") {
    return to === prefix.admin;
  }
  if (cabinet === "sales") {
    return to === prefix.sales;
  }
  if (cabinet === "accounting") {
    return to === prefix.accounting;
  }
  return false;
}
