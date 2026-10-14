import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  batchAvailableForLoadingKg,
  batchQualityRejectReturnKg,
  batchReturnableToWarehouseKg,
  batchKgInSelectionRemainder,
  batchesRemainingInSelection,
  estimatedPackageCountForLoading,
  estimatedPackageCountForWarehouseReturn,
  estimatedPackageCountInSelectionRemainder,
} from "./batch-available-for-loading.js";

describe("batchesRemainingInSelection", () => {
  it("полностью возвращённая из отбора партия в новую ПН не идёт", () => {
    const kept = batch({ id: "kornishon", onWarehouseKg: 1148, availableForLoadingKg: 1148, blockingReturnKg: 0 });
    const returned = batch({
      id: "euro",
      onWarehouseKg: 1148,
      availableForLoadingKg: 1148,
      qualityRejectWrittenOffKg: 1148,
      blockingReturnKg: 1148,
    });
    expect(batchesRemainingInSelection([kept, returned]).map((b) => b.id)).toEqual(["kornishon"]);
  });
});

describe("batchKgInSelectionRemainder", () => {
  it("без активной блокировки показывает склад к погрузке (журнал — история)", () => {
    const b = batch({
      id: "b1",
      onWarehouseKg: 4300,
      availableForLoadingKg: 4300,
      qualityRejectWrittenOffKg: 4300,
      blockingReturnKg: 0,
    });
    expect(batchAvailableForLoadingKg(b)).toBe(4300);
    expect(batchKgInSelectionRemainder(b)).toBe(4300);
  });

  it("активная блокировка из отбора уменьшает остаток до создания ПН", () => {
    const b = batch({
      id: "b1",
      onWarehouseKg: 100,
      availableForLoadingKg: 100,
      qualityRejectWrittenOffKg: 40,
      blockingReturnKg: 40,
    });
    expect(batchAvailableForLoadingKg(b)).toBe(100);
    expect(batchKgInSelectionRemainder(b)).toBe(60);
  });

  it("сценарий догрузки: 4800 на складе, вернули 800 — в отборе 4000", () => {
    const b = batch({
      id: "b1",
      totalKg: 4800,
      onWarehouseKg: 4800,
      availableForLoadingKg: 4800,
      qualityRejectWrittenOffKg: 800,
      blockingReturnKg: 800,
    });
    expect(batchKgInSelectionRemainder(b)).toBe(4000);
    expect(batchReturnableToWarehouseKg(b)).toBe(4000);
  });

  it("полный возврат из рейса без блокировки: на складе есть кг, в отборе тоже", () => {
    const b = batch({
      id: "b1",
      onWarehouseKg: 15950,
      availableForLoadingKg: 15950,
      inTransitKg: 0,
      qualityRejectWrittenOffKg: 15950,
      blockingReturnKg: 0,
    });
    expect(batchAvailableForLoadingKg(b)).toBe(15950);
    expect(batchKgInSelectionRemainder(b)).toBe(15950);
    expect(batchReturnableToWarehouseKg(b)).toBe(15950);
  });
});

function batch(p: Partial<BatchListItem> & Pick<BatchListItem, "id">): BatchListItem {
  return {
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 100,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    ...p,
  };
}

describe("batchAvailableForLoadingKg", () => {
  it("журнал возвратов не уменьшает доступность к погрузке", () => {
    expect(
      batchAvailableForLoadingKg(
        batch({ id: "b1", onWarehouseKg: 100, qualityRejectWrittenOffKg: 30 }),
      ),
    ).toBe(100);
  });

  it("предпочитает availableForLoadingKg с API", () => {
    expect(
      batchAvailableForLoadingKg(
        batch({
          id: "b1",
          onWarehouseKg: 100,
          qualityRejectWrittenOffKg: 30,
          availableForLoadingKg: 65,
        }),
      ),
    ).toBe(65);
  });

  it("не уходит ниже нуля", () => {
    expect(batchAvailableForLoadingKg(batch({ id: "b1", onWarehouseKg: -5 }))).toBe(0);
  });
});

describe("estimatedPackageCountForLoading", () => {
  it("пропорция по физическому остатку на складе", () => {
    expect(
      estimatedPackageCountForLoading(
        batch({
          id: "b1",
          totalKg: 100,
          onWarehouseKg: 100,
          qualityRejectWrittenOffKg: 50,
          nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
        }),
      ),
    ).toBe(20);
  });

  it("после частичной погрузки с явными ящиками ПН — остаток 150−125, не пропорция 275/1275", () => {
    const nizam = batch({
      id: "nizam",
      totalKg: 1275,
      onWarehouseKg: 275,
      inTransitKg: 1000,
      availableForLoadingKg: 275,
      packagesInLoadingManifests: 125,
      nakladnaya: { linePackageCount: 150 } as BatchListItem["nakladnaya"],
    });
    expect(estimatedPackageCountForLoading(nizam)).toBe(25);
    expect(estimatedPackageCountInSelectionRemainder(nizam)).toBe(25);
    // Пропорция дала бы ≈32 — её не используем, когда есть факт ПН.
    expect(Math.round((275 / 1275) * 150)).toBe(32);
  });
});

describe("batchQualityRejectReturnKg", () => {
  it("0 без поля", () => {
    expect(batchQualityRejectReturnKg(batch({ id: "b1" }))).toBe(0);
  });
});

describe("batchReturnableToWarehouseKg", () => {
  it("склад + рейс минус журнал", () => {
    expect(
      batchReturnableToWarehouseKg(
        batch({ id: "b1", onWarehouseKg: 10, inTransitKg: 5, qualityRejectWrittenOffKg: 3 }),
      ),
    ).toBe(12);
  });

  it("при полном журнале разрешает ремонт по inTransit", () => {
    expect(
      batchReturnableToWarehouseKg(
        batch({
          id: "b1",
          onWarehouseKg: 0,
          inTransitKg: 15950,
          qualityRejectWrittenOffKg: 15950,
        }),
      ),
    ).toBe(15950);
  });

  it("после полного журнала без блокировки — можно снова вернуть из отбора", () => {
    expect(
      batchReturnableToWarehouseKg(
        batch({
          id: "b1",
          onWarehouseKg: 15950,
          inTransitKg: 0,
          qualityRejectWrittenOffKg: 15950,
          blockingReturnKg: 0,
        }),
      ),
    ).toBe(15950);
  });

  it("когда уже заблокировано из отбора — 0", () => {
    expect(
      batchReturnableToWarehouseKg(
        batch({
          id: "b1",
          onWarehouseKg: 15950,
          inTransitKg: 0,
          qualityRejectWrittenOffKg: 15950,
          blockingReturnKg: 15950,
        }),
      ),
    ).toBe(0);
  });
});

describe("estimatedPackageCountForWarehouseReturn", () => {
  it("пропорция по returnable кг", () => {
    expect(
      estimatedPackageCountForWarehouseReturn(
        batch({
          id: "b1",
          totalKg: 100,
          onWarehouseKg: 0,
          inTransitKg: 100,
          nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
        }),
      ),
    ).toBe(20);
  });
});

describe("сценарии отображения: списание с рейса / догрузка / другой рейс", () => {
  it("после возврата с рейса (без blocks_loading) — к погрузке весь склад, можно в другой рейс", () => {
    const afterTripReturn = batch({
      id: "b1",
      totalKg: 200,
      onWarehouseKg: 200,
      inTransitKg: 0,
      availableForLoadingKg: 200,
      qualityRejectWrittenOffKg: 200,
      blockingReturnKg: 0,
    });
    expect(batchAvailableForLoadingKg(afterTripReturn)).toBe(200);
    expect(batchKgInSelectionRemainder(afterTripReturn)).toBe(200);
    expect(batchesRemainingInSelection([afterTripReturn]).map((b) => b.id)).toEqual(["b1"]);
    expect(estimatedPackageCountForLoading({
      ...afterTripReturn,
      nakladnaya: { linePackageCount: 20 } as BatchListItem["nakladnaya"],
    })).toBe(20);
  });

  it("частичный возврат с рейса: на складе хвост к другому рейсу, в транзите остаток", () => {
    const partial = batch({
      id: "b1",
      totalKg: 100,
      onWarehouseKg: 40,
      inTransitKg: 60,
      availableForLoadingKg: 40,
      qualityRejectWrittenOffKg: 40,
      blockingReturnKg: 0,
    });
    expect(batchAvailableForLoadingKg(partial)).toBe(40);
    expect(batchReturnableToWarehouseKg(partial)).toBe(60);
    expect(batchKgInSelectionRemainder(partial)).toBe(40);
  });

  it("возврат из отбора: в новой ПН остаток без блокировки; списанное не в отборе", () => {
    const fromSelection = batch({
      id: "b1",
      totalKg: 100,
      onWarehouseKg: 100,
      availableForLoadingKg: 100,
      qualityRejectWrittenOffKg: 35,
      blockingReturnKg: 35,
    });
    expect(batchAvailableForLoadingKg(fromSelection)).toBe(100);
    expect(batchKgInSelectionRemainder(fromSelection)).toBe(65);
    expect(batchReturnableToWarehouseKg(fromSelection)).toBe(65);
  });

  it("полный возврат из отбора — партия не попадает в новую погрузку", () => {
    const full = batch({
      id: "b1",
      onWarehouseKg: 100,
      availableForLoadingKg: 100,
      qualityRejectWrittenOffKg: 100,
      blockingReturnKg: 100,
    });
    expect(batchKgInSelectionRemainder(full)).toBe(0);
    expect(batchesRemainingInSelection([full])).toEqual([]);
    expect(batchReturnableToWarehouseKg(full)).toBe(0);
  });

  it("после догрузки журнал очищен — снова полный отбор и возврат", () => {
    const afterAppend = batch({
      id: "b1",
      totalKg: 100,
      onWarehouseKg: 100,
      availableForLoadingKg: 100,
      qualityRejectWrittenOffKg: 0,
      blockingReturnKg: 0,
    });
    expect(batchAvailableForLoadingKg(afterAppend)).toBe(100);
    expect(batchKgInSelectionRemainder(afterAppend)).toBe(100);
    expect(batchReturnableToWarehouseKg(afterAppend)).toBe(100);
  });
});
