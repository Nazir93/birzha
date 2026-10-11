import { describe, expect, it } from "vitest";

import { buildPurchaseByPurchaserReport } from "./purchase-by-purchaser-report.js";

describe("buildPurchaseByPurchaserReport", () => {
  it("агрегирует закупщик × склад: сумма, кг, ящики; итоги по осям", () => {
    const report = buildPurchaseByPurchaserReport("2026-08-01", "2026-08-31", [
      {
        purchaserUserId: "u1",
        purchaserLogin: "ivan",
        warehouseId: "wh-manas",
        warehouseName: "Манас",
        linesKopecks: 100_000n,
        extraKopecks: 500n,
        grams: 1_000_000n,
        packages: 10n,
        supplierId: "s-murad",
        supplierName: "Мурад",
        onWarehouseGrams: 200_000n,
        onWarehousePackages: 2,
        onWarehouseValueKopecks: 20_000n,
        paidKopecks: 40_000n,
      },
      {
        purchaserUserId: "u1",
        purchaserLogin: "ivan",
        warehouseId: "wh-manas",
        warehouseName: "Манас",
        linesKopecks: 50_000n,
        extraKopecks: 0n,
        grams: 500_000n,
        packages: 5n,
        supplierId: "s-murad",
        supplierName: "Мурад",
        onWarehouseGrams: 0n,
        onWarehousePackages: 0,
        onWarehouseValueKopecks: 0n,
        paidKopecks: 50_000n,
      },
      {
        purchaserUserId: "u1",
        purchaserLogin: "ivan",
        warehouseId: "wh-kayakent",
        warehouseName: "Каякент",
        linesKopecks: 20_000n,
        extraKopecks: 0n,
        grams: 200_000n,
        packages: 2n,
        supplierId: "s-umar",
        supplierName: "Умар",
        onWarehouseGrams: 200_000n,
        onWarehousePackages: 2,
        onWarehouseValueKopecks: 8_000n,
        paidKopecks: 0n,
      },
      {
        purchaserUserId: "u2",
        purchaserLogin: "petr",
        warehouseId: "wh-manas",
        warehouseName: "Манас",
        linesKopecks: 30_000n,
        extraKopecks: 100n,
        grams: 300_000n,
        packages: 3n,
        supplierId: "s-murad",
        supplierName: "Мурад",
        onWarehouseGrams: 0n,
        onWarehousePackages: 0,
        onWarehouseValueKopecks: 0n,
        paidKopecks: 10_000n,
      },
      {
        purchaserUserId: null,
        purchaserLogin: null,
        warehouseId: "wh-manas",
        warehouseName: "Манас",
        linesKopecks: 1_000n,
        extraKopecks: 0n,
        grams: 10_000n,
        packages: 1n,
        supplierId: null,
        supplierName: null,
        onWarehouseGrams: 10_000n,
        onWarehousePackages: 1,
        onWarehouseValueKopecks: 500n,
        paidKopecks: 0n,
      },
    ]);

    expect(report.from).toBe("2026-08-01");
    expect(report.to).toBe("2026-08-31");
    expect(report.cells).toHaveLength(4);

    const ivanManas = report.cells.find(
      (c) => c.purchaserLogin === "ivan" && c.warehouseId === "wh-manas",
    );
    expect(ivanManas).toMatchObject({
      documentCount: 2,
      packageCount: 15,
      totalKg: 1500,
      totalKopecks: "150500",
      onWarehouseKg: 200,
      onWarehousePackageCount: 2,
      documentsWithStockCount: 1,
    });

    const ivan = report.byPurchaser.find((p) => p.purchaserLogin === "ivan");
    expect(ivan).toMatchObject({
      documentCount: 3,
      packageCount: 17,
      totalKg: 1700,
      totalKopecks: "170500",
      onWarehouseKg: 400,
      onWarehousePackageCount: 4,
      documentsWithStockCount: 2,
    });

    const manas = report.byWarehouse.find((w) => w.warehouseId === "wh-manas");
    expect(manas).toMatchObject({
      documentCount: 4,
      packageCount: 19,
      totalKg: 1810,
      totalKopecks: "181600",
      onWarehouseKg: 210,
      onWarehousePackageCount: 3,
      documentsWithStockCount: 2,
    });

    expect(report.grand).toMatchObject({
      documentCount: 5,
      packageCount: 21,
      totalKg: 2010,
      totalKopecks: "201600",
      onWarehouseKg: 410,
      onWarehousePackageCount: 5,
      documentsWithStockCount: 3,
      paidKopecks: "100000",
      remainingPayableKopecks: "101600",
      onWarehouseValueKopecks: "28500",
    });

    const murad = report.bySupplier.find((s) => s.supplierName === "Мурад");
    expect(murad).toMatchObject({
      totalKopecks: "180600",
      paidKopecks: "100000",
      remainingPayableKopecks: "80600",
      documentsWithStockCount: 1,
      onWarehouseKg: 200,
    });

    expect(report.byWarehouseSupplier.some((r) => r.warehouseId === "wh-kayakent" && r.supplierName === "Умар")).toBe(
      true,
    );

    const orphan = report.cells.find((c) => c.purchaserUserId === null);
    expect(orphan?.purchaserLogin).toBe("Без автора");
  });

  it("пустой период — нулевые итоги", () => {
    const report = buildPurchaseByPurchaserReport("2026-01-01", "2026-01-31", []);
    expect(report.cells).toEqual([]);
    expect(report.byPurchaser).toEqual([]);
    expect(report.byWarehouse).toEqual([]);
    expect(report.bySupplier).toEqual([]);
    expect(report.grand).toEqual({
      totalKg: 0,
      packageCount: 0,
      totalKopecks: "0",
      documentCount: 0,
      onWarehouseKg: 0,
      onWarehousePackageCount: 0,
      documentsWithStockCount: 0,
      onWarehouseValueKopecks: "0",
      paidKopecks: "0",
      remainingPayableKopecks: "0",
    });
  });
});
