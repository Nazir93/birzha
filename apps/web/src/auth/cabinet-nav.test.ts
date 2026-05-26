import { describe, expect, it } from "vitest";

import { buildCabinetNavEntries, cabinetNavLinkUsesEnd, splitCabinetNavForSidebar } from "./cabinet-nav.js";
import { accounting, adminRoutes, ops, prefix, sales } from "../routes.js";

describe("cabinet-nav", () => {
  it("аноним: операции — шесть ссылок /o (в т.ч. Рейсы и Архив)", () => {
    const links = buildCabinetNavEntries("operations", null, false);
    expect(links).toHaveLength(6);
    expect(links[0]?.to).toBe(ops.purchaseNakladnaya);
    expect(links[1]?.to).toBe(ops.distribution);
    expect(links[2]?.to).toBe(ops.trips);
    expect(links[3]?.to).toBe(ops.reports);
    expect(links[4]?.to).toBe(ops.operations);
    expect(links[5]?.to).toBe(ops.archive);
  });

  it("аноним: админ — сводка /a + операции (единая погрузка)", () => {
    const links = buildCabinetNavEntries("admin", null, false);
    expect(links[0]).toEqual({ to: adminRoutes.home, label: "Сводка", key: "home" });
    expect(links[1]?.to).toBe(adminRoutes.purchaseNakladnaya);
    expect(links[2]?.to).toBe(adminRoutes.distribution);
    expect(links[3]?.to).toBe(adminRoutes.trips);
    expect(links[links.length - 1]?.to).toBe(adminRoutes.archive);
    expect(links).toHaveLength(7);
  });

  it("admin: рабочие ссылки остаются внутри /a", () => {
    const user = {
      id: "u1",
      login: "admin",
      roles: [{ roleCode: "admin", scopeType: "global" as const, scopeId: "" }],
    };
    const links = buildCabinetNavEntries("admin", user, true);
    expect(links.find((x) => x.key === "nakladnaya")?.to).toBe(adminRoutes.purchaseNakladnaya);
    expect(links.find((x) => x.key === "distribution")?.to).toBe(adminRoutes.distribution);
    expect(links.find((x) => x.key === "trips")?.to).toBe(adminRoutes.trips);
    expect(links.find((x) => x.key === "archive")?.to).toBe(adminRoutes.archive);
    expect(links.find((x) => x.key === "loadingManifests")).toBeUndefined();
    expect(links.find((x) => x.key === "reports")).toBeUndefined();
    expect(links.find((x) => x.key === "operations")?.to).toBe(adminRoutes.operations);
    expect(links.find((x) => x.key === "sellerDispatch")?.to).toBe(adminRoutes.sellerDispatch);
    expect(links.find((x) => x.key === "assignSeller")?.to).toBe(adminRoutes.assignSeller);
    expect(links.find((x) => x.key === "settings")?.to).toBe(adminRoutes.settingsCatalog);
    expect(links.find((x) => x.key === "inventory")).toBeUndefined();
    expect(links.find((x) => x.key === "users")).toBeUndefined();
    expect(links.find((x) => x.key === "jump-accounting")?.to).toBe(accounting.home);
  });

  it("бухгалтерия: только сводка, отчёт и контрагенты (без операций /o)", () => {
    const user = {
      id: "u2",
      login: "acc",
      roles: [{ roleCode: "accountant", scopeType: "global" as const, scopeId: "" }],
    };
    const links = buildCabinetNavEntries("accounting", user, true);
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ to: accounting.home, label: "Сводка", key: "acc-home" });
    expect(links[1]).toEqual({ to: accounting.reports, label: "Отчёт по рейсу", key: "acc-reports" });
    expect(links[2]).toEqual({ to: accounting.counterparties, label: "Контрагенты", key: "acc-cp" });
    expect(links.every((l) => l.to.startsWith(prefix.accounting))).toBe(true);
  });

  it("продавец (только seller): кабинет /s — продажа, отчёт и архив", () => {
    const user = {
      id: "u1",
      login: "seller1",
      roles: [{ roleCode: "seller", scopeType: "global" as const, scopeId: "" }],
    };
    const links = buildCabinetNavEntries("sales", user, true);
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ to: sales.home, label: "Продажа", key: "sales-home" });
    expect(links[1]).toEqual({ to: sales.reports, label: "Отчёт по рейсу", key: "reports" });
    expect(links[2]).toEqual({ to: sales.archive, label: "Архив", key: "archive" });
  });

  it("seller + склад: на /s остаётся сводка и доступные подразделы", () => {
    const user = {
      id: "u2",
      login: "mix",
      roles: [
        { roleCode: "seller", scopeType: "global" as const, scopeId: "" },
        { roleCode: "warehouse", scopeType: "global" as const, scopeId: "" },
      ],
    };
    const links = buildCabinetNavEntries("sales", user, true);
    expect(links.find((x) => x.key === "sales-home")?.to).toBe(sales.home);
    expect(links.find((x) => x.key === "reports")?.to).toBe(sales.reports);
    expect(links.find((x) => x.key === "operations")?.to).toBe(sales.operations);
  });

  it("splitCabinetNavForSidebar: архив внизу", () => {
    const links = buildCabinetNavEntries("operations", null, false);
    const { main, bottom } = splitCabinetNavForSidebar(links);
    expect(bottom).toHaveLength(1);
    expect(bottom[0]?.key).toBe("archive");
    expect(main.find((x) => x.key === "archive")).toBeUndefined();
    expect(main[main.length - 1]?.key).not.toBe("archive");
  });

  it("cabinetNavLinkUsesEnd только для корней /a /s /b", () => {
    expect(cabinetNavLinkUsesEnd("admin", prefix.admin)).toBe(true);
    expect(cabinetNavLinkUsesEnd("admin", ops.reports)).toBe(false);
    expect(cabinetNavLinkUsesEnd("operations", ops.reports)).toBe(false);
  });
});
