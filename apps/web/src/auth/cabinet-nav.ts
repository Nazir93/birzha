import type { AuthUser } from "./auth-context.js";
import {
  canAccessCabinet,
  hrefForPanelInCabinet,
  NAV_PANEL_LABELS,
  operationsPanelOrder,
  type CabinetId,
} from "./role-panels.js";
import { accounting, adminRoutes, ops, prefix, sales } from "../routes.js";

export type CabinetNavEntry = { to: string; label: string; key: string };

const ANON_OPS: CabinetNavEntry[] = [
  { key: "nakl", to: ops.purchaseNakladnaya, label: NAV_PANEL_LABELS.nakladnaya },
  { key: "dist", to: ops.distribution, label: NAV_PANEL_LABELS.distribution },
  { key: "rep", to: ops.reports, label: NAV_PANEL_LABELS.reports },
  { key: "op", to: ops.operations, label: NAV_PANEL_LABELS.operations },
  { key: "off", to: ops.offline, label: NAV_PANEL_LABELS.offline },
];

const ANON_ADMIN_OPS: CabinetNavEntry[] = [
  { key: "nakl", to: adminRoutes.purchaseNakladnaya, label: NAV_PANEL_LABELS.nakladnaya },
  { key: "dist", to: adminRoutes.distribution, label: NAV_PANEL_LABELS.distribution },
  { key: "lm", to: adminRoutes.loadingManifests, label: NAV_PANEL_LABELS.loadingManifests },
  { key: "rep", to: adminRoutes.reports, label: NAV_PANEL_LABELS.reports },
  { key: "op", to: adminRoutes.operations, label: NAV_PANEL_LABELS.operations },
  { key: "off", to: adminRoutes.offline, label: NAV_PANEL_LABELS.offline },
];

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
    out.push({ to: sales.home, label: "Сводка", key: "sales-home" });
  }
  if (cabinet === "accounting") {
    out.push({ to: accounting.home, label: "Сводка", key: "acc-home" });
    out.push({ to: accounting.counterparties, label: "Контрагенты", key: "acc-cp" });
    out.push({ to: accounting.sellerDispatch, label: NAV_PANEL_LABELS.sellerDispatch, key: "acc-dispatch" });
    out.push({ to: accounting.trade, label: NAV_PANEL_LABELS.assignSeller, key: "acc-trade" });
  }
  const panelOrder =
    cabinet === "admin"
      ? ([
          "nakladnaya",
          "distribution",
          "loadingManifests",
          "sellerDispatch",
          "assignSeller",
          "operations",
          "offline",
          "inventory",
          "users",
          "service",
        ] as const)
      : operationsPanelOrder(user);
  for (const p of panelOrder) {
    const to = hrefForPanelInCabinet(user, p, cabinet);
    if (to) {
      out.push({ to, label: NAV_PANEL_LABELS[p], key: p });
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
