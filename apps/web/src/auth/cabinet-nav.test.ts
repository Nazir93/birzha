import { describe, expect, it } from "vitest";

import { buildCabinetNavEntries, cabinetNavLinkUsesEnd } from "./cabinet-nav.js";
import { accounting, adminRoutes, ops, prefix } from "../routes.js";

describe("cabinet-nav", () => {
  it("аноним: операции — только пять ссылок /o", () => {
    const links = buildCabinetNavEntries("operations", null, false);
    expect(links).toHaveLength(5);
    expect(links[0]?.to).toBe(ops.purchaseNakladnaya);
  });

  it("аноним: админ — сводка /a + те же операции", () => {
    const links = buildCabinetNavEntries("admin", null, false);
    expect(links[0]).toEqual({ to: adminRoutes.home, label: "Сводка", key: "home" });
    expect(links[1]?.to).toBe(adminRoutes.purchaseNakladnaya);
    expect(links[2]?.to).toBe(adminRoutes.distribution);
    expect(links[3]?.to).toBe(adminRoutes.loadingManifests);
    expect(links).toHaveLength(7);
  });

  it("admin: рабочие ссылки остаются внутри /a", () => {
    const user = {
      id: "u1",
      login: "admin",
      roles: [{ roleCode: "admin", scopeType: "global" as const, scopeId: "" }],
    };
    const links = buildCabinetNavEntries("admin", user, true);
    expect(links.find((x) => x.key === "distribution")?.to).toBe(adminRoutes.distribution);
    expect(links.find((x) => x.key === "loadingManifests")?.to).toBe(adminRoutes.loadingManifests);
    expect(links.find((x) => x.key === "nakladnaya")?.to).toBe(adminRoutes.purchaseNakladnaya);
    expect(links.find((x) => x.key === "reports")).toBeUndefined();
    expect(links.find((x) => x.key === "operations")?.to).toBe(adminRoutes.operations);
    expect(links.find((x) => x.key === "sellerDispatch")?.to).toBe(adminRoutes.sellerDispatch);
    expect(links.find((x) => x.key === "assignSeller")?.to).toBe(adminRoutes.assignSeller);
    expect(links.find((x) => x.key === "jump-accounting")?.to).toBe(accounting.home);
  });

  it("бухгалтерия: отгрузка и продажи отдельно", () => {
    const user = {
      id: "u2",
      login: "acc",
      roles: [{ roleCode: "accountant", scopeType: "global" as const, scopeId: "" }],
    };
    const links = buildCabinetNavEntries("accounting", user, true);
    expect(links.find((x) => x.key === "acc-dispatch")?.to).toBe(accounting.sellerDispatch);
    expect(links.find((x) => x.key === "acc-trade")?.to).toBe(accounting.trade);
  });

  it("cabinetNavLinkUsesEnd только для корней /a /s /b", () => {
    expect(cabinetNavLinkUsesEnd("admin", prefix.admin)).toBe(true);
    expect(cabinetNavLinkUsesEnd("admin", ops.reports)).toBe(false);
    expect(cabinetNavLinkUsesEnd("operations", ops.reports)).toBe(false);
  });
});
