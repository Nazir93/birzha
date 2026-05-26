import { describe, expect, it } from "vitest";

import { accounting, adminRoutes, ops, sales } from "../routes.js";
import {
  canAccessCabinet,
  canAccessPanel,
  canCreateTrip,
  canManageInventoryCatalog,
  canWriteCounterpartyCatalog,
  defaultRouteForUser,
  hrefForPanelInCabinet,
  isFieldSellerOnly,
  operationsPanelOrder,
  postLoginRedirectPath,
} from "./role-panels.js";

function userWithRoles(...roleCodes: string[]) {
  return {
    id: "u1",
    login: "t",
    roles: roleCodes.map((roleCode) => ({ roleCode, scopeType: "global" as const, scopeId: "" })),
  };
}

describe("role-panels", () => {
  it("admin видит всё", () => {
    const u = userWithRoles("admin");
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "loadingManifests")).toBe(true);
  });

  it("manager не видит админ-кабинет и админские панели", () => {
    const u = userWithRoles("manager");
    expect(canAccessCabinet(u, "admin")).toBe(false);
    expect(canAccessPanel(u, "inventory")).toBe(false);
    expect(canAccessPanel(u, "settings")).toBe(false);
    expect(canAccessPanel(u, "loadingManifests")).toBe(true);
    expect(canAccessPanel(u, "sellerDispatch")).toBe(true);
    expect(canAccessPanel(u, "assignSeller")).toBe(true);
    expect(canAccessPanel(u, "users")).toBe(false);
    expect(canManageInventoryCatalog(u)).toBe(false);
  });

  it("inventory и users ведут в подразделы настроек", () => {
    const admin = userWithRoles("admin");
    expect(hrefForPanelInCabinet(admin, "inventory", "admin")).toBe(adminRoutes.settingsCatalog);
    expect(hrefForPanelInCabinet(admin, "users", "admin")).toBe(adminRoutes.settingsTeam);
    expect(hrefForPanelInCabinet(admin, "settings", "admin")).toBe(adminRoutes.settingsCatalog);
  });

  it("loadingManifests ведёт на единый раздел distribution", () => {
    expect(hrefForPanelInCabinet(userWithRoles("warehouse"), "loadingManifests", "operations")).toBe(
      ops.distribution,
    );
    expect(hrefForPanelInCabinet(userWithRoles("admin"), "loadingManifests", "admin")).toBe(adminRoutes.distribution);
  });

  it("warehouse и logistics видят Погрузку (как Распределение)", () => {
    expect(canAccessPanel(userWithRoles("warehouse"), "loadingManifests")).toBe(true);
    expect(canAccessPanel(userWithRoles("logistics"), "loadingManifests")).toBe(true);
    expect(canAccessPanel(userWithRoles("receiver"), "loadingManifests")).toBe(true);
  });

  it("бухгалтер — отчёты и контрагенты, не операции и не отгрузка/продажи", () => {
    const u = userWithRoles("accountant");
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "assignSeller")).toBe(false);
    expect(canAccessPanel(u, "sellerDispatch")).toBe(false);
    expect(canAccessPanel(u, "nakladnaya")).toBe(false);
    expect(canAccessPanel(u, "distribution")).toBe(false);
    expect(canAccessPanel(u, "operations")).toBe(false);
  });

  it("продавец — только отчёты, операции; не накладная и не служебное", () => {
    const u = userWithRoles("seller");
    expect(canAccessPanel(u, "nakladnaya")).toBe(false);
    expect(canAccessPanel(u, "distribution")).toBe(false);
    expect(canAccessPanel(u, "operations")).toBe(true);
    expect(canAccessPanel(u, "assignSeller")).toBe(false);
    expect(canAccessPanel(u, "reports")).toBe(true);
  });

  it("defaultRouteForUser", () => {
    expect(defaultRouteForUser(userWithRoles("accountant"))).toBe(accounting.home);
    expect(defaultRouteForUser(userWithRoles("seller"))).toBe(sales.home);
    expect(defaultRouteForUser(userWithRoles("warehouse"))).toBe(ops.purchaseNakladnaya);
    expect(defaultRouteForUser(userWithRoles("purchaser"))).toBe(ops.purchaseNakladnaya);
    expect(defaultRouteForUser(userWithRoles("admin"))).toBe(adminRoutes.home);
  });

  it("postLoginRedirectPath — не оставлять другой кабинет после смены учётки", () => {
    expect(postLoginRedirectPath(userWithRoles("admin"), sales.reports)).toBe(adminRoutes.home);
    expect(postLoginRedirectPath(userWithRoles("seller"), sales.reports)).toBe(sales.reports);
    expect(postLoginRedirectPath(userWithRoles("seller"), `${sales.reports}?trip=t1`)).toBe(`${sales.reports}?trip=t1`);
    expect(postLoginRedirectPath(userWithRoles("seller"), adminRoutes.reports)).toBe(sales.home);
    expect(postLoginRedirectPath(userWithRoles("warehouse"), ops.reports)).toBe(ops.reports);
  });

  it("operationsPanelOrder: у logistics отчёты первые", () => {
    const order = operationsPanelOrder(userWithRoles("logistics"));
    expect(order[0]).toBe("reports");
  });

  it("operationsPanelOrder: только seller — отчёт по рейсу в кабинете продаж", () => {
    expect(operationsPanelOrder(userWithRoles("seller"))).toEqual(["reports", "archive"]);
  });

  it("canCreateTrip совпадает с TRIP_WRITE (admin, manager, logistics)", () => {
    expect(canCreateTrip(userWithRoles("admin"))).toBe(true);
    expect(canCreateTrip(userWithRoles("manager"))).toBe(true);
    expect(canCreateTrip(userWithRoles("logistics"))).toBe(true);
    expect(canCreateTrip(userWithRoles("seller"))).toBe(false);
    expect(canCreateTrip(userWithRoles("accountant"))).toBe(false);
    expect(canCreateTrip(userWithRoles("warehouse"))).toBe(false);
  });

  it("canWriteCounterpartyCatalog — как CATALOG_WRITE на API (admin, manager, accountant)", () => {
    expect(canWriteCounterpartyCatalog(userWithRoles("admin"))).toBe(true);
    expect(canWriteCounterpartyCatalog(userWithRoles("manager"))).toBe(true);
    expect(canWriteCounterpartyCatalog(userWithRoles("accountant"))).toBe(true);
    expect(canWriteCounterpartyCatalog(userWithRoles("seller"))).toBe(false);
    expect(canWriteCounterpartyCatalog(userWithRoles("warehouse"))).toBe(false);
    expect(canWriteCounterpartyCatalog(null)).toBe(false);
  });

  it("isFieldSellerOnly: только глобальный seller без закуп/склада/руководства", () => {
    expect(isFieldSellerOnly(userWithRoles("seller"))).toBe(true);
    expect(isFieldSellerOnly(userWithRoles("seller", "warehouse"))).toBe(false);
    expect(isFieldSellerOnly(null)).toBe(false);
  });

  it("без глобальных ролей — только отчёты", () => {
    const u = { id: "x", login: "x", roles: [] as { roleCode: string; scopeType: string; scopeId: string }[] };
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "operations")).toBe(false);
  });

  it("кабинет: бух не /o, продавец не /o, закуп — /o", () => {
    expect(canAccessCabinet(userWithRoles("accountant"), "accounting")).toBe(true);
    expect(canAccessCabinet(userWithRoles("accountant"), "operations")).toBe(false);
    expect(canAccessCabinet(userWithRoles("seller"), "sales")).toBe(true);
    expect(canAccessCabinet(userWithRoles("seller"), "operations")).toBe(false);
    expect(canAccessCabinet(userWithRoles("warehouse"), "operations")).toBe(true);
  });

  it("панель users (сотрудники) — только admin", () => {
    expect(canAccessPanel(userWithRoles("admin"), "users")).toBe(true);
    expect(canAccessPanel(userWithRoles("manager"), "users")).toBe(false);
    expect(canAccessPanel(userWithRoles("seller"), "users")).toBe(false);
    expect(canAccessPanel(userWithRoles("accountant"), "users")).toBe(false);
  });
});
