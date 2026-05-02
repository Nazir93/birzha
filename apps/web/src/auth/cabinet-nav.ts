import type { AuthUser } from "./auth-context.js";
import { hrefForPanelInCabinet, NAV_PANEL_LABELS, operationsPanelOrder, type CabinetId } from "./role-panels.js";
import { accounting, adminRoutes, ops, prefix, sales } from "../routes.js";

export type CabinetNavEntry = { to: string; label: string; key: string };

const ANON_OPS: CabinetNavEntry[] = [
  { key: "nakl", to: ops.purchaseNakladnaya, label: NAV_PANEL_LABELS.nakladnaya },
  { key: "dist", to: ops.distribution, label: NAV_PANEL_LABELS.distribution },
  { key: "rep", to: ops.reports, label: NAV_PANEL_LABELS.reports },
  { key: "op", to: ops.operations, label: NAV_PANEL_LABELS.operations },
  { key: "off", to: ops.offline, label: NAV_PANEL_LABELS.offline },
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
      return [{ to: adminRoutes.home, label: "Сводка", key: "home" }, ...ANON_OPS];
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
  }
  const panelOrder = operationsPanelOrder(user);
  for (const p of panelOrder) {
    const to = hrefForPanelInCabinet(user, p, cabinet);
    if (to) {
      out.push({ to, label: NAV_PANEL_LABELS[p], key: p });
    }
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
