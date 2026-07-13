import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  AGGREGATE_NO_PURCHASE_DOCUMENT_KEY,
  aggregateBatchesByCaliberLine,
  aggregateBatchesByDocumentCaliberLine,
  aggregateBatchesByPurchaseDocument,
  buildWriteOffItemsFromBatches,
  buildWriteOffItemsFromBatchesByPackages,
  buildWriteOffItemsFromInputs,
  aggregateLoadingManifestLinesByCaliber,
  estimatedPackageCountOnShelf,
  formatLoadingManifestCardHeader,
  formatLoadingManifestDisplayName,
  formatLoadingManifestTableNumberLabel,
  formatManifestWarehouseNames,
  resolveLoadingManifestNumberForSave,
  filterBatchesForLoadingManifest,
  formatPurchaseDocumentDisplayLabel,
  loadingManifestRoadCsvContent,
  sumLoadingManifestTotals,
  summarizeAllocationBreakdown,
} from "./loading-manifest.js";

function b(p: Partial<BatchListItem> & Pick<BatchListItem, "id" | "onWarehouseKg" | "totalKg">): BatchListItem {
  return {
    purchaseId: "pur",
    pricePerKg: 0,
    pendingInboundKg: 0,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...p,
  };
}

describe("estimatedPackageCountOnShelf", () => {
  it("доля остатка к массе × ящиков в строке накладной", () => {
    const row = b({
      id: "1",
      totalKg: 100,
      onWarehouseKg: 50,
      nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
    });
    expect(estimatedPackageCountOnShelf(row)).toBe(10);
  });

  it("весь остаток — полное число ящиков из строки", () => {
    const row = b({
      id: "2",
      totalKg: 10,
      onWarehouseKg: 10,
      nakladnaya: { linePackageCount: 7 } as BatchListItem["nakladnaya"],
    });
    expect(estimatedPackageCountOnShelf(row)).toBe(7);
  });

  it("без linePackageCount — null", () => {
    const row = b({ id: "3", totalKg: 10, onWarehouseKg: 5, nakladnaya: { productGradeCode: "x" } as BatchListItem["nakladnaya"] });
    expect(estimatedPackageCountOnShelf(row)).toBeNull();
  });
});

describe("formatPurchaseDocumentDisplayLabel", () => {
  it("показывает номер даже без documentId", () => {
    expect(formatPurchaseDocumentDisplayLabel(null, "дадай · 2026-07-13")).toBe("№ дадай · 2026-07-13");
  });

  it("fallback на хвост id", () => {
    expect(formatPurchaseDocumentDisplayLabel("abcdef123456", "")).toBe("№ …123456");
  });

  it("без данных — явная подпись", () => {
    expect(formatPurchaseDocumentDisplayLabel(null, null)).toBe("Без накладной в данных");
  });
});

describe("filterBatchesForLoadingManifest", () => {
  it("при 0 вариантов накл. — все партии с остатком", () => {
    const batches = [
      b({ id: "a", onWarehouseKg: 1, totalKg: 1, nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"] }),
      b({ id: "b", onWarehouseKg: 0, totalKg: 1, nakladnaya: { documentId: "d2" } as BatchListItem["nakladnaya"] }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 0, new Set());
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("только отмеченные documentId", () => {
    const batches = [
      b({ id: "a", onWarehouseKg: 1, totalKg: 1, nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"] }),
      b({ id: "b", onWarehouseKg: 2, totalKg: 2, nakladnaya: { documentId: "d2" } as BatchListItem["nakladnaya"] }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 2, new Set(["d1"]));
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });

  it("пустое выделение при наличии вариантов — ничего не включает", () => {
    const batches = [
      b({ id: "a", onWarehouseKg: 1, totalKg: 1, nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"] }),
      b({ id: "b", onWarehouseKg: 2, totalKg: 2, nakladnaya: { documentId: "d2" } as BatchListItem["nakladnaya"] }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 2, new Set());
    expect(r).toHaveLength(0);
  });

  it("строка без documentId при активном фильтре — не включается", () => {
    const batches = [b({ id: "x", onWarehouseKg: 1, totalKg: 1 })];
    const r = filterBatchesForLoadingManifest(batches, 1, new Set(["d1"]));
    expect(r).toHaveLength(0);
  });

  it("скрывает партии, где весь остаток уже в журнале возвратов", () => {
    const batches = [
      b({
        id: "a",
        onWarehouseKg: 100,
        totalKg: 100,
        qualityRejectWrittenOffKg: 100,
        nakladnaya: { documentId: "d1" } as BatchListItem["nakladnaya"],
      }),
    ];
    const r = filterBatchesForLoadingManifest(batches, 0, new Set());
    expect(r).toHaveLength(0);
  });
});

describe("sumLoadingManifestTotals", () => {
  it("сумма кг и оценка ящиков по участвующим строкам", () => {
    const batches = [
      b({
        id: "1",
        totalKg: 10,
        onWarehouseKg: 5,
        nakladnaya: { linePackageCount: 10 } as BatchListItem["nakladnaya"],
      }),
      b({ id: "2", totalKg: 1, onWarehouseKg: 1, nakladnaya: {} as BatchListItem["nakladnaya"] }),
    ];
    const t = sumLoadingManifestTotals(batches);
    expect(t.kg).toBe(6);
    expect(t.batchCount).toBe(2);
    expect(t.linesWithPkg).toBe(1);
    expect(t.pkg).toBe(5);
  });

  it("вычитает кг из журнала возвратов", () => {
    const batches = [
      b({
        id: "1",
        totalKg: 100,
        onWarehouseKg: 100,
        qualityRejectWrittenOffKg: 40,
        nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
      }),
    ];
    const t = sumLoadingManifestTotals(batches);
    expect(t.kg).toBe(60);
    expect(t.pkg).toBe(12);
  });
});

describe("aggregateBatchesByCaliberLine", () => {
  it("суммирует кг и оценку ящиков по калибру/товарной подписи", () => {
    const batches = [
      b({
        id: "a1",
        totalKg: 100,
        onWarehouseKg: 30,
        nakladnaya: {
          documentId: "d1",
          warehouseId: "w1",
          productGradeCode: "5",
          productGroup: "Том",
          documentNumber: "1",
          linePackageCount: 20,
        } as BatchListItem["nakladnaya"],
      }),
      b({
        id: "a2",
        totalKg: 10,
        onWarehouseKg: 5,
        nakladnaya: {
          documentId: "d1",
          warehouseId: "w1",
          productGradeCode: "5",
          productGroup: "Том",
          documentNumber: "1",
          linePackageCount: 10,
        } as BatchListItem["nakladnaya"],
      }),
    ];
    const g = aggregateBatchesByCaliberLine(batches);
    expect(g).toHaveLength(1);
    expect(g[0]!.lineLabel).toContain("Том");
    expect(g[0]!.lineLabel).toContain("5");
    expect(g[0]!.totalKg).toBe(35);
    expect(g[0]!.partCount).toBe(2);
  });
});

describe("aggregateBatchesByPurchaseDocument", () => {
  it("склеивает партии одной накладной в одну строку", () => {
    const nk = {
      documentId: "doc-1",
      warehouseId: "w1",
      productGradeCode: "5",
      productGroup: "Том",
      documentNumber: "100",
      linePackageCount: 100,
    } as BatchListItem["nakladnaya"];
    const batches = [
      b({ id: "a1", totalKg: 100, onWarehouseKg: 30, nakladnaya: nk }),
      b({ id: "a2", totalKg: 50, onWarehouseKg: 20, nakladnaya: nk }),
    ];
    const rows = aggregateBatchesByPurchaseDocument(batches);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rowKey).toBe("doc-1");
    expect(rows[0]!.totalKg).toBe(50);
    expect(rows[0]!.partCount).toBe(2);
    expect(rows[0]!.displayLabel).toContain("100");
  });

  it("партии без накладной — одна строка в конце", () => {
    const rows = aggregateBatchesByPurchaseDocument([
      b({ id: "x", totalKg: 1, onWarehouseKg: 1 }),
      b({ id: "y", totalKg: 2, onWarehouseKg: 2 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.rowKey).toBe(AGGREGATE_NO_PURCHASE_DOCUMENT_KEY);
    expect(rows[0]!.totalKg).toBe(3);
  });
});

describe("summarizeAllocationBreakdown", () => {
  it("делит кг на складе по destination и без направления", () => {
    const batches = [
      b({
        id: "1",
        onWarehouseKg: 10,
        totalKg: 10,
        allocation: { qualityTier: null, destination: "moscow" },
      }),
      b({ id: "2", onWarehouseKg: 5, totalKg: 5 }),
    ];
    const s = summarizeAllocationBreakdown(batches, ["moscow", "regions"], { moscow: "Москва", regions: "Регионы" });
    expect(s.assignedRows.find((r) => r.code === "moscow")).toMatchObject({ kg: 10, batchCount: 1 });
    expect(s.unassigned).toMatchObject({ kg: 5, batchCount: 1 });
    expect(s.inTransit.kg).toBe(0);
  });

  it("учитывает inTransitKg по партиям", () => {
    const batches = [
      b({
        id: "1",
        onWarehouseKg: 10,
        totalKg: 50,
        inTransitKg: 25,
        allocation: { qualityTier: null, destination: null },
      }),
    ];
    const s = summarizeAllocationBreakdown(batches, ["moscow"], { moscow: "Москва" });
    expect(s.unassigned.kg).toBe(10);
    expect(s.inTransit).toMatchObject({ kg: 25, batchCount: 1 });
  });
});

describe("aggregateLoadingManifestLinesByCaliber", () => {
  it("суммирует кг и ящики по одному калибру из нескольких строк", () => {
    const rows = aggregateLoadingManifestLinesByCaliber([
      { kg: 100, packageCount: "10", productGroup: "Помидоры", productGradeCode: "№5" },
      { kg: 50, packageCount: "5", productGroup: "Помидоры", productGradeCode: "№5" },
      { kg: 3, packageCount: null, productGroup: "Помидоры", productGradeCode: "№8" },
    ]);
    expect(rows).toHaveLength(2);
    const r5 = rows.find((r) => r.caliberLabel.includes("№5"));
    expect(r5?.totalKg).toBe(150);
    expect(r5?.totalPackages).toBe(15);
    const r8 = rows.find((r) => r.caliberLabel.includes("№8"));
    expect(r8?.totalPackages).toBeNull();
  });

  it("сортирует калибры по канону 5–8, НС+, НС-, ОМ", () => {
    const rows = aggregateLoadingManifestLinesByCaliber([
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "Ом." },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "НС-" },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "№8" },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "НС+" },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "№5" },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "№7" },
      { kg: 1, packageCount: null, productGroup: "Помидоры", productGradeCode: "№6" },
    ]);
    expect(rows.map((r) => r.caliberLabel)).toEqual([
      "Помидоры · №5",
      "Помидоры · №6",
      "Помидоры · №7",
      "Помидоры · №8",
      "Помидоры · НС+",
      "Помидоры · НС-",
      "Помидоры · Ом.",
    ]);
  });
});

describe("formatLoadingManifestTableNumberLabel", () => {
  it("убирает рейс, дату и город из длинного автономера", () => {
    expect(
      formatLoadingManifestTableNumberLabel({
        manifestNumber: "01 Курбан · а123но05 · 29.06.2026 · Москва · 2026-06-29",
        destinationName: "Москва",
        docDate: "2026-06-29",
        tripLabel: "01 Курбан · а123но05 · 29.06.2026",
      }),
    ).toBe("—");
  });

  it("оставляет только отличительную часть без рейса", () => {
    expect(
      formatLoadingManifestTableNumberLabel({
        manifestNumber: "С айгид · Ф500ФФ · 29.06.2026 · Москва · 2026-06-29",
        destinationName: "Москва",
        docDate: "2026-06-29",
      }),
    ).toBe("№ С айгид · Ф500ФФ");
  });

  it("показывает короткий ручной номер", () => {
    expect(
      formatLoadingManifestTableNumberLabel({
        manifestNumber: "Фура-12",
        destinationName: "Москва",
        docDate: "2026-06-05",
      }),
    ).toBe("№ Фура-12");
  });
});

describe("formatLoadingManifestCardHeader", () => {
  it("убирает повтор рейса и длинного номера — остаются город, дата и склады", () => {
    expect(
      formatLoadingManifestCardHeader({
        manifestNumber: "01 Курбан · а123но05 · 29.06.2026 · Москва · 2026-06-29",
        destinationName: "Москва",
        docDate: "2026-06-29",
        tripLabel: "01 Курбан · а123но05 · 29.06.2026",
        warehouseLabel: "Дербент, Каякент, Манас",
      }),
    ).toEqual({
      title: "Москва",
      meta: "29.06.2026 · Дербент, Каякент, Манас",
    });
  });

  it("для короткого номера без рейса — номер, дата, склад", () => {
    expect(
      formatLoadingManifestCardHeader({
        manifestNumber: "С айгид · Ф500ФФ · 29.06.2026 · Москва · 2026-06-29",
        destinationName: "Москва",
        docDate: "2026-06-29",
        warehouseLabel: "Каякент",
      }),
    ).toEqual({
      title: "№ С айгид · Ф500ФФ",
      meta: "29.06.2026 · Каякент",
    });
  });
});

describe("formatLoadingManifestDisplayName", () => {
  it("для автономера ПН-… показывает только направление", () => {
    expect(
      formatLoadingManifestDisplayName({
        manifestNumber: "ПН-2087687687-111",
        destinationName: "Москва",
      }),
    ).toBe("Москва");
  });

  it("для своего номера добавляет №", () => {
    expect(
      formatLoadingManifestDisplayName({
        manifestNumber: "Фура-12",
        destinationName: "Москва",
      }),
    ).toBe("Москва · № Фура-12");
  });

  it("не дублирует направление, если оно уже есть в номере", () => {
    expect(
      formatLoadingManifestDisplayName({
        manifestNumber: "Москва · Ф-5656 05 · 2026-06-05",
        destinationName: "Москва",
      }),
    ).toBe("№ Москва · Ф-5656 05 · 2026-06-05");
  });
});

describe("resolveLoadingManifestNumberForSave", () => {
  it("без рейса → город и дата", () => {
    expect(
      resolveLoadingManifestNumberForSave({
        destinationLabel: "Москва",
        docDate: "2026-05-19",
      }),
    ).toBe("Москва · 19.05.2026");
  });

  it("с рейсом → номер рейса и дата", () => {
    expect(
      resolveLoadingManifestNumberForSave({
        tripNumber: "Ф-2026-001",
        destinationLabel: "Москва",
        docDate: "2026-05-19",
      }),
    ).toBe("Ф-2026-001 · Москва · 19.05.2026");
  });

  it("добавляет суффикс при занятом номере", () => {
    expect(
      resolveLoadingManifestNumberForSave({
        tripNumber: "Ф-1",
        destinationLabel: "Москва",
        docDate: "2026-05-19",
        takenNumbers: ["Ф-1 · Москва · 19.05.2026"],
      }),
    ).toBe("Ф-1 · Москва · 19.05.2026 (2)");
  });
});

describe("loadingManifestRoadCsvContent", () => {
  it("включает шапку и итого", () => {
    const csv = loadingManifestRoadCsvContent({
      manifestNumber: "ПН-1",
      docDate: "2026-05-13",
      warehouseLabel: "Манас (MANAS)",
      destinationName: "Москва",
      tripLabel: "Р-01",
      rows: [{ caliberLabel: "Помидоры · №5", totalKg: 10.5, totalPackages: 2 }],
    });
    expect(csv).toContain("Погрузочная накладная (на машину);Москва · № ПН-1");
    expect(csv).toContain("Дата;13.05.2026");
    expect(csv).toContain("Рейс;Р-01");
    expect(csv).toContain("Итого");
  });
});

describe("formatManifestWarehouseNames", () => {
  it("один склад — как fallback если списка нет", () => {
    expect(formatManifestWarehouseNames(undefined, "Манас")).toBe("Манас");
  });

  it("несколько складов — через запятую", () => {
    expect(formatManifestWarehouseNames(["Каякент", "Манас", "Манас"], "Манас")).toBe("Каякент, Манас");
  });
});

describe("aggregateBatchesByDocumentCaliberLine", () => {
  it("не смешивает один калибр из разных накладных", () => {
    const nak = (docId: string, docNum: string, code: string) =>
      ({
        documentId: docId,
        warehouseId: "w1",
        productGradeCode: code,
        productGroup: "Том",
        documentNumber: docNum,
      }) as BatchListItem["nakladnaya"];

    const rows = aggregateBatchesByDocumentCaliberLine([
      b({ id: "a1", totalKg: 10, onWarehouseKg: 10, nakladnaya: nak("d1", "100", "5") }),
      b({ id: "a2", totalKg: 20, onWarehouseKg: 15, nakladnaya: nak("d2", "200", "5") }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.documentNumber).sort()).toEqual(["100", "200"]);
    expect(rows.every((r) => r.totalKg > 0)).toBe(true);
  });
});

describe("buildWriteOffItemsFromBatches", () => {
  it("распределяет кг по партиям по порядку", () => {
    const items = buildWriteOffItemsFromBatches(
      [
        b({ id: "b1", totalKg: 10, onWarehouseKg: 6 }),
        b({ id: "b2", totalKg: 10, onWarehouseKg: 4 }),
      ],
      8,
    );
    expect(items).toEqual([
      { batchId: "b1", kg: 6 },
      { batchId: "b2", kg: 2 },
    ]);
  });
});

describe("buildWriteOffItemsFromBatchesByPackages", () => {
  it("распределяет ящики по партиям и переводит в кг", () => {
    const items = buildWriteOffItemsFromBatchesByPackages(
      [
        b({
          id: "b1",
          totalKg: 100,
          onWarehouseKg: 50,
          nakladnaya: { documentId: "d1", warehouseId: "w1", productGradeCode: "5", productGroup: null, documentNumber: "1", linePackageCount: 20 },
        }),
        b({
          id: "b2",
          totalKg: 100,
          onWarehouseKg: 50,
          nakladnaya: { documentId: "d1", warehouseId: "w1", productGradeCode: "6", productGroup: null, documentNumber: "1", linePackageCount: 20 },
        }),
      ],
      15,
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ batchId: "b1", kg: 50 });
    expect(items[1]?.batchId).toBe("b2");
    expect(items[1]?.kg).toBe(25);
  });
});

describe("buildWriteOffItemsFromInputs", () => {
  const batches = [
    b({
      id: "b1",
      totalKg: 100,
      onWarehouseKg: 40,
      nakladnaya: { documentId: "d1", warehouseId: "w1", productGradeCode: "5", productGroup: null, documentNumber: "1", linePackageCount: 10 },
    }),
  ];
  const row = { totalKg: 40, totalPkg: 4, linesWithPkg: 1 };

  it("приоритет кг над ящиками", () => {
    const items = buildWriteOffItemsFromInputs(batches, row, "10", "99");
    expect(items).toEqual([{ batchId: "b1", kg: 10 }]);
  });

  it("списание по ящикам если кг не заданы", () => {
    const items = buildWriteOffItemsFromInputs(batches, row, "", "2");
    expect(items).toEqual([{ batchId: "b1", kg: 20 }]);
  });

  it("null при превышении остатка", () => {
    expect(buildWriteOffItemsFromInputs(batches, row, "50", "")).toBeNull();
    expect(buildWriteOffItemsFromInputs(batches, row, "", "10")).toBeNull();
  });
});
