import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  batchAvailableForLoadingKg,
  batchQualityRejectReturnKg,
  batchReturnableToWarehouseKg,
  batchKgInSelectionRemainder,
  estimatedPackageCountForLoading,
  estimatedPackageCountForWarehouseReturn,
} from "./batch-available-for-loading.js";

describe("batchKgInSelectionRemainder", () => {
  it("после возврата из черновика остаток в отборе уменьшается, склад к погрузке — нет", () => {
    const b = batch({
      id: "b1",
      onWarehouseKg: 100,
      availableForLoadingKg: 100,
      qualityRejectWrittenOffKg: 40,
    });
    expect(batchAvailableForLoadingKg(b)).toBe(100);
    expect(batchKgInSelectionRemainder(b)).toBe(60);
  });

  it("полный возврат из рейса: на складе есть кг, в отборе 0", () => {
    const b = batch({
      id: "b1",
      onWarehouseKg: 15950,
      availableForLoadingKg: 15950,
      inTransitKg: 0,
      qualityRejectWrittenOffKg: 15950,
    });
    expect(batchAvailableForLoadingKg(b)).toBe(15950);
    expect(batchKgInSelectionRemainder(b)).toBe(0);
    expect(batchReturnableToWarehouseKg(b)).toBe(0);
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

  it("после полного возврата на складе — 0", () => {
    expect(
      batchReturnableToWarehouseKg(
        batch({
          id: "b1",
          onWarehouseKg: 15950,
          inTransitKg: 0,
          qualityRejectWrittenOffKg: 15950,
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
