import { describe, expect, it } from "vitest";

import { accounting, adminRoutes, ops, sales } from "../routes.js";
import {
  canAccessCabinet,
  canAccessPanel,
  canCreateTrip,
  canWriteCounterpartyCatalog,
  defaultRouteForUser,
  isFieldSellerOnly,
  operationsPanelOrder,
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
    expect(canAccessPanel(u, "service")).toBe(true);
  });

  it("бухгалтер — отчёты, не операции и не накладная", () => {
    const u = userWithRoles("accountant");
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "nakladnaya")).toBe(false);
    expect(canAccessPanel(u, "distribution")).toBe(false);
    expect(canAccessPanel(u, "operations")).toBe(false);
    expect(canAccessPanel(u, "offline")).toBe(false);
  });

  it("продавец — только отчёты, операции, офлайн; не накладная и не служебное", () => {
    const u = userWithRoles("seller");
    expect(canAccessPanel(u, "nakladnaya")).toBe(false);
    expect(canAccessPanel(u, "distribution")).toBe(false);
    expect(canAccessPanel(u, "operations")).toBe(true);
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "service")).toBe(false);
  });

  it("defaultRouteForUser", () => {
    expect(defaultRouteForUser(userWithRoles("accountant"))).toBe(accounting.home);
    expect(defaultRouteForUser(userWithRoles("seller"))).toBe(sales.home);
    expect(defaultRouteForUser(userWithRoles("warehouse"))).toBe(ops.purchaseNakladnaya);
    expect(defaultRouteForUser(userWithRoles("purchaser"))).toBe(ops.purchaseNakladnaya);
    expect(defaultRouteForUser(userWithRoles("admin"))).toBe(adminRoutes.home);
  });

  it("operationsPanelOrder: у logistics отчёты первые", () => {
    const order = operationsPanelOrder(userWithRoles("logistics"));
    expect(order[0]).toBe("reports");
  });

  it("operationsPanelOrder: только seller — отчёт и офлайн без дубля «Операции»", () => {
    expect(operationsPanelOrder(userWithRoles("seller"))).toEqual(["reports", "offline"]);
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

  it("панель users (сотрудники) — только admin и manager", () => {
    expect(canAccessPanel(userWithRoles("admin"), "users")).toBe(true);
    expect(canAccessPanel(userWithRoles("manager"), "users")).toBe(true);
    expect(canAccessPanel(userWithRoles("seller"), "users")).toBe(false);
    expect(canAccessPanel(userWithRoles("accountant"), "users")).toBe(false);
  });
});
