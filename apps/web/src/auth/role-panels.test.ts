import { describe, expect, it } from "vitest";

import { routes } from "../routes.js";
import { canAccessPanel, defaultRouteForUser } from "./role-panels.js";

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
    expect(canAccessPanel(u, "operations")).toBe(false);
    expect(canAccessPanel(u, "offline")).toBe(false);
  });

  it("продавец — накладная и операции, не служебное", () => {
    const u = userWithRoles("seller");
    expect(canAccessPanel(u, "nakladnaya")).toBe(true);
    expect(canAccessPanel(u, "operations")).toBe(true);
    expect(canAccessPanel(u, "service")).toBe(false);
  });

  it("defaultRouteForUser", () => {
    expect(defaultRouteForUser(userWithRoles("accountant"))).toBe(routes.reports);
    expect(defaultRouteForUser(userWithRoles("seller"))).toBe(routes.reports);
  });

  it("без глобальных ролей — только отчёты", () => {
    const u = { id: "x", login: "x", roles: [] as { roleCode: string; scopeType: string; scopeId: string }[] };
    expect(canAccessPanel(u, "reports")).toBe(true);
    expect(canAccessPanel(u, "operations")).toBe(false);
  });
});
