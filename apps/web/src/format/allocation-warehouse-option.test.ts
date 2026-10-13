import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  buildAllocationWarehouseOptions,
  formatAllocationWarehouseSelectLabel,
} from "./allocation-warehouse-option.js";

function batch(id: string, warehouseId: string, kg: number): BatchListItem {
  return {
    id,
    onWarehouseKg: kg,
    nakladnaya: { warehouseId, documentNumber: "N-1" },
  } as BatchListItem;
}

const sumPkg = () => ({ sum: 0, linesWithBoxData: 0 });

describe("buildAllocationWarehouseOptions", () => {
  it("показывает полный остаток на складе, даже если партии в резерве ПН", () => {
    const whId = "wh-1";
    const all = [batch("b1", whId, 500), batch("b2", whId, 300)];
    const eligibleByWarehouse = new Map([[whId, all]]);
    const availableByWarehouse = new Map<string, BatchListItem[]>([[whId, []]]);

    const rows = buildAllocationWarehouseOptions({
      warehouseCatalog: [{ id: whId, name: "Каякент" }],
      availableByWarehouse,
      eligibleByWarehouse,
      extraWarehouseOrder: [],
      reservedBatchIds: new Set(["b1", "b2"]),
      sumPackageEstimatesForWarehouse: sumPkg,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.batchCount).toBe(0);
    expect(rows[0]?.totalKgOnWarehouse).toBe(800);
    expect(rows[0]?.totalBatchCountOnWarehouse).toBe(2);
    expect(rows[0]?.reservedBatchCount).toBe(2);
  });

  it("разделяет свободный и зарезервированный остаток", () => {
    const whId = "wh-1";
    const all = [batch("b1", whId, 500), batch("b2", whId, 300)];
    const available = [batch("b2", whId, 300)];
    const eligibleByWarehouse = new Map([[whId, all]]);
    const availableByWarehouse = new Map([[whId, available]]);

    const rows = buildAllocationWarehouseOptions({
      warehouseCatalog: [{ id: whId, name: "Манас" }],
      availableByWarehouse,
      eligibleByWarehouse,
      extraWarehouseOrder: [],
      reservedBatchIds: new Set(["b1"]),
      sumPackageEstimatesForWarehouse: sumPkg,
    });

    expect(rows[0]?.totalKgOnWarehouse).toBe(800);
    expect(rows[0]?.batchCount).toBe(1);
    expect(rows[0]?.totalKg).toBe(300);
  });
});

describe("buildAllocationWarehouseOptions — все товары на складе", () => {
  it("в подписи склада учитывает и помидоры, и огурцы", () => {
    const whId = "wh-1";
    const tomato = batch("t1", whId, 1000);
    tomato.nakladnaya = { warehouseId: whId, documentNumber: "01", productGroup: "Помидоры" };
    const cucumber = batch("c1", whId, 500);
    cucumber.nakladnaya = { warehouseId: whId, documentNumber: "02", productGroup: "Огурцы" };
    const all = [tomato, cucumber];
    const rows = buildAllocationWarehouseOptions({
      warehouseCatalog: [{ id: whId, name: "Дербент" }],
      availableByWarehouse: new Map([[whId, all]]),
      eligibleByWarehouse: new Map([[whId, all]]),
      extraWarehouseOrder: [],
      reservedBatchIds: new Set(),
      sumPackageEstimatesForWarehouse: sumPkg,
    });
    expect(rows[0]?.totalKgOnWarehouse).toBe(1500);
    expect(rows[0]?.totalBatchCountOnWarehouse).toBe(2);
    expect(formatAllocationWarehouseSelectLabel("Дербент", rows[0]!)).toMatch(/1[\s\u00a0]500 кг/);
  });
});

describe("formatAllocationWarehouseSelectLabel", () => {
  it("добавляет пометку «в резерве ПН», если весь остаток зарезервирован", () => {
    const label = formatAllocationWarehouseSelectLabel("Каякент", {
      id: "wh-1",
      batchCount: 0,
      totalKg: 0,
      packageEstimate: 0,
      linesWithBoxData: 0,
      totalKgOnWarehouse: 1200,
      totalBatchCountOnWarehouse: 3,
      totalPackageEstimateOnWarehouse: 0,
      totalLinesWithBoxDataOnWarehouse: 0,
      reservedBatchCount: 3,
      reservedKg: 1200,
    });
    expect(label).toMatch(/1[\s\u00a0]200 кг/);
    expect(label).toContain("3 парт.");
    expect(label).toContain("в резерве ПН");
  });
});
