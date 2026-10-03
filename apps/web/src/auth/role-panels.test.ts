import { describe, expect, it } from "vitest";

import { accounting, adminRoutes, ops, sales } from "../routes.js";
import {
  canAccessCabinet,
  canAccessPanel,
  canCloseOrDeleteTrip,
  canCreateTrip,
  canShipLoadingManifest,
  canManageInventoryCatalog,
  canEditPurchaseDocumentLines,
  canRecordWarehouseReturn,
  canWriteCounterpartyCatalog,
  defaultRouteForUser,
  hrefForPanelInCabinet,
  isFieldSellerOnly,
  isPurchaserScoped,
  operationsPanelOrder,
  adminSidebarPanelOrder,
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

  it("manager видит кабинет админа и те же панели", () => {
    const u = userWithRoles("manager");
    expect(canAccessCabinet(u, "admin")).toBe(true);
    expect(canAccessCabinet(u, "operations")).toBe(true);
    expect(canAccessPanel(u, "inventory")).toBe(true);
    expect(canAccessPanel(u, "settings")).toBe(true);
    expect(canAccessPanel(u, "users")).toBe(true);
    expect(canAccessPanel(u, "loadingManifests")).toBe(true);
    expect(canAccessPanel(u, "assignSeller")).toBe(true);
    expect(canManageInventoryCatalog(u)).toBe(true);
    expect(defaultRouteForUser(u)).toBe(adminRoutes.home);
  });

  it("правка строк закупочной накладной — admin, manager, purchaser", () => {
    expect(canEditPurchaseDocumentLines(userWithRoles("admin"))).toBe(true);
    expect(canEditPurchaseDocumentLines(userWithRoles("manager"))).toBe(true);
    expect(canEditPurchaseDocumentLines(userWithRoles("purchaser"))).toBe(true);
    expect(canEditPurchaseDocumentLines(userWithRoles("warehouse"))).toBe(false);
    expect(canEditPurchaseDocumentLines(userWithRoles("seller"))).toBe(false);
    expect(canEditPurchaseDocumentLines(null)).toBe(false);
  });

  it("возврат на склад — как batchCreate API, не как ship", () => {
    expect(canRecordWarehouseReturn(userWithRoles("admin"))).toBe(true);
    expect(canRecordWarehouseReturn(userWithRoles("purchaser"))).toBe(true);
    expect(canRecordWarehouseReturn(userWithRoles("warehouse"))).toBe(true);
    expect(canRecordWarehouseReturn(userWithRoles("logistics"))).toBe(false);
    expect(canRecordWarehouseReturn(userWithRoles("receiver"))).toBe(false);
  });

  it("inventory и users ведут в подразделы настроек", () => {
    const admin = userWithRoles("admin");
    expect(hrefForPanelInCabinet(admin, "inventory", "admin")).toBe(adminRoutes.settingsCatalog);
    expect(hrefForPanelInCabinet(admin, "users", "admin")).toBe(adminRoutes.settingsTeam);
    expect(hrefForPanelInCabinet(admin, "settings", "admin")).toBe(adminRoutes.settingsCatalog);
  });

  it("loadingAppend и loadingTrip доступны тем же ролям, что и distribution", () => {
    const u = userWithRoles("warehouse");
    expect(hrefForPanelInCabinet(u, "loadingAppend", "operations")).toBe(ops.loadingAppend);
    expect(hrefForPanelInCabinet(userWithRoles("admin"), "loadingTrip", "admin")).toBe(adminRoutes.loadingTrip);
    expect(canAccessPanel(userWithRoles("accountant"), "loadingAppend")).toBe(false);
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
    expect(defaultRouteForUser(userWithRoles("purchaser"))).toBe(ops.home);
    expect(defaultRouteForUser(userWithRoles("admin"))).toBe(adminRoutes.home);
  });

  it("postLoginRedirectPath — не оставлять другой кабинет после смены учётки", () => {
    expect(postLoginRedirectPath(userWithRoles("admin"), sales.reports)).toBe(adminRoutes.home);
    expect(postLoginRedirectPath(userWithRoles("seller"), sales.reports)).toBe(sales.reports);
    expect(postLoginRedirectPath(userWithRoles("seller"), `${sales.reports}?trip=t1`)).toBe(`${sales.reports}?trip=t1`);
    expect(postLoginRedirectPath(userWithRoles("seller"), adminRoutes.reports)).toBe(sales.home);
    expect(postLoginRedirectPath(userWithRoles("warehouse"), ops.reports)).toBe(ops.reports);
    expect(postLoginRedirectPath(userWithRoles("admin"), "/login")).toBe(adminRoutes.home);
    expect(postLoginRedirectPath(userWithRoles("admin"), "")).toBe(adminRoutes.home);
    expect(postLoginRedirectPath(userWithRoles("admin"), "/")).toBe(adminRoutes.home);
  });

  it("operationsPanelOrder: у logistics отчёты первые", () => {
    const order = operationsPanelOrder(userWithRoles("logistics"));
    expect(order[0]).toBe("reports");
  });

  it("operationsPanelOrder: рейсы выше погрузки; догрузка и смена рейса после погрузки", () => {
    const order = operationsPanelOrder(userWithRoles("warehouse"));
    expect(order.indexOf("trips")).toBeGreaterThan(order.indexOf("nakladnaya"));
    expect(order.indexOf("distribution")).toBeGreaterThan(order.indexOf("trips"));
    expect(order.indexOf("warehouseReturns")).toBeGreaterThan(order.indexOf("distribution"));
    expect(order.indexOf("loadingAppend")).toBeGreaterThan(order.indexOf("warehouseReturns"));
    expect(order.indexOf("loadingTrip")).toBeGreaterThan(order.indexOf("loadingAppend"));
  });

  it("operationsPanelOrder: только seller — отчёт по рейсу в кабинете продаж", () => {
    expect(operationsPanelOrder(userWithRoles("seller"))).toEqual(["reports", "archive"]);
  });

  it("canCreateTrip совпадает с TRIP_WRITE (admin, manager, logistics, purchaser)", () => {
    expect(canCreateTrip(userWithRoles("admin"))).toBe(true);
    expect(canCreateTrip(userWithRoles("manager"))).toBe(true);
    expect(canCreateTrip(userWithRoles("logistics"))).toBe(true);
    expect(canCreateTrip(userWithRoles("purchaser"))).toBe(true);
    expect(canCreateTrip(userWithRoles("seller"))).toBe(false);
    expect(canCreateTrip(userWithRoles("accountant"))).toBe(false);
    expect(canCreateTrip(userWithRoles("warehouse"))).toBe(false);
  });

  it("canCloseOrDeleteTrip — только admin", () => {
    expect(canCloseOrDeleteTrip(userWithRoles("admin"))).toBe(true);
    expect(canCloseOrDeleteTrip(userWithRoles("manager"))).toBe(false);
    expect(canCloseOrDeleteTrip(userWithRoles("logistics"))).toBe(false);
    expect(canCloseOrDeleteTrip(userWithRoles("purchaser"))).toBe(false);
    expect(canCloseOrDeleteTrip(userWithRoles("seller"))).toBe(false);
  });

  it("canShipLoadingManifest совпадает с ship на API", () => {
    expect(canShipLoadingManifest(userWithRoles("admin"))).toBe(true);
    expect(canShipLoadingManifest(userWithRoles("warehouse"))).toBe(true);
    expect(canShipLoadingManifest(userWithRoles("logistics"))).toBe(true);
    expect(canShipLoadingManifest(userWithRoles("purchaser"))).toBe(true);
    expect(canShipLoadingManifest(userWithRoles("seller"))).toBe(false);
    expect(canShipLoadingManifest(null)).toBe(false);
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

  it("isPurchaserScoped: purchaser без admin/manager", () => {
    expect(isPurchaserScoped(userWithRoles("purchaser"))).toBe(true);
    expect(isPurchaserScoped(userWithRoles("purchaser", "warehouse"))).toBe(true);
    expect(isPurchaserScoped(userWithRoles("purchaser", "manager"))).toBe(false);
    expect(isPurchaserScoped(userWithRoles("admin"))).toBe(false);
    expect(isPurchaserScoped(userWithRoles("warehouse"))).toBe(false);
    expect(isPurchaserScoped(null)).toBe(false);
  });

  it("purchaser: сайдбар как у админа на операциях — 6 разделов, без отчётов/продаж/архива", () => {
    const u = userWithRoles("purchaser");
    expect(canAccessPanel(u, "assignSeller")).toBe(false);
    expect(canAccessPanel(u, "sellerDispatch")).toBe(false);
    expect(canAccessPanel(u, "reports")).toBe(false);
    expect(canAccessPanel(u, "operations")).toBe(false);
    expect(canAccessPanel(u, "archive")).toBe(false);
    expect(canAccessPanel(u, "nakladnaya")).toBe(true);
    expect(canAccessPanel(u, "trips")).toBe(true);
    expect(canAccessPanel(u, "distribution")).toBe(true);
    expect(canAccessPanel(u, "warehouseReturns")).toBe(true);
    expect(canAccessPanel(u, "loadingAppend")).toBe(true);
    expect(canAccessPanel(u, "loadingTrip")).toBe(true);
    expect(canAccessPanel(u, "purchaseByPurchaser")).toBe(true);
    expect(canAccessPanel(u, "purchaserExpenses")).toBe(true);
    expect(operationsPanelOrder(u)).toEqual([
      "nakladnaya",
      "trips",
      "distribution",
      "purchaserExpenses",
      "warehouseReturns",
      "loadingAppend",
      "loadingTrip",
    ]);
  });

  it("без глобальных ролей — только отчёты", () => {
    const u = { id: "x", login: "x", roles: [] as { roleCode: string; scopeType: string; scopeId: string }[] };
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "operations")).toBe(false);
  });

  it("кабинет: бух не /o, продавец не /o, закуп — /o", () => {
    expect(canAccessCabinet(userWithRoles("accountant"), "accounting")).toBe(true);
    expect(canAccessCabinet(userWithRoles("accountant"), "operations")).toBe(false);
    expect(canAccessCabinet(userWithRoles("accountant"), "sales")).toBe(false);
    expect(canAccessCabinet(userWithRoles("accountant"), "admin")).toBe(false);
    expect(canAccessCabinet(userWithRoles("manager"), "operations")).toBe(true);
    expect(canAccessCabinet(userWithRoles("manager"), "admin")).toBe(true);
    expect(canAccessCabinet(userWithRoles("manager"), "sales")).toBe(true);
    expect(canAccessCabinet(userWithRoles("manager"), "accounting")).toBe(true);
    expect(canAccessCabinet(userWithRoles("seller"), "sales")).toBe(true);
    expect(canAccessCabinet(userWithRoles("seller"), "operations")).toBe(false);
    expect(canAccessCabinet(userWithRoles("warehouse"), "operations")).toBe(true);
  });

  it("если есть accountant (без admin и manager), старт и доступ только в /b", () => {
    const mixed = userWithRoles("accountant", "seller");
    expect(defaultRouteForUser(mixed)).toBe(accounting.home);
    expect(canAccessCabinet(mixed, "accounting")).toBe(true);
    expect(canAccessCabinet(mixed, "operations")).toBe(false);
    expect(canAccessCabinet(mixed, "sales")).toBe(false);
    expect(canAccessCabinet(mixed, "admin")).toBe(false);
  });

  it("если есть manager (без admin), старт в /a как у админа", () => {
    const mixed = userWithRoles("manager", "seller", "warehouse");
    expect(defaultRouteForUser(mixed)).toBe(adminRoutes.home);
    expect(canAccessCabinet(mixed, "admin")).toBe(true);
    expect(canAccessCabinet(mixed, "operations")).toBe(true);
    expect(canAccessCabinet(mixed, "accounting")).toBe(true);
    expect(canAccessCabinet(mixed, "sales")).toBe(true);
  });

  it("панель users (сотрудники) — admin и manager", () => {
    expect(canAccessPanel(userWithRoles("admin"), "users")).toBe(true);
    expect(canAccessPanel(userWithRoles("manager"), "users")).toBe(true);
    expect(canAccessPanel(userWithRoles("seller"), "users")).toBe(false);
    expect(canAccessPanel(userWithRoles("accountant"), "users")).toBe(false);
  });

  it("purchaseByPurchaser — admin/manager/purchaser; в сайдбаре нет (сводка / подробнее)", () => {
    expect(canAccessPanel(userWithRoles("admin"), "purchaseByPurchaser")).toBe(true);
    expect(canAccessPanel(userWithRoles("manager"), "purchaseByPurchaser")).toBe(true);
    expect(canAccessPanel(userWithRoles("purchaser"), "purchaseByPurchaser")).toBe(true);
    expect(canAccessPanel(userWithRoles("warehouse"), "purchaseByPurchaser")).toBe(false);
    expect(adminSidebarPanelOrder(userWithRoles("admin"))).not.toContain("purchaseByPurchaser");
    expect(operationsPanelOrder(userWithRoles("manager"))).not.toContain("purchaseByPurchaser");
    expect(operationsPanelOrder(userWithRoles("purchaser"))).not.toContain("purchaseByPurchaser");
  });
});
