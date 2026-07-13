import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  batchAvailableForLoadingKg,
  batchQualityRejectReturnKg,
  estimatedPackageCountForLoading,
} from "./batch-available-for-loading.js";

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
  it("onWarehouse минус журнал возвратов", () => {
    expect(
      batchAvailableForLoadingKg(
        batch({ id: "b1", onWarehouseKg: 100, qualityRejectWrittenOffKg: 30 }),
      ),
    ).toBe(70);
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
    expect(
      batchAvailableForLoadingKg(
        batch({ id: "b1", onWarehouseKg: 50, qualityRejectWrittenOffKg: 80 }),
      ),
    ).toBe(0);
  });
});

describe("estimatedPackageCountForLoading", () => {
  it("пропорция по доступным кг", () => {
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
    ).toBe(10);
  });
});

describe("batchQualityRejectReturnKg", () => {
  it("0 без поля", () => {
    expect(batchQualityRejectReturnKg(batch({ id: "b1" }))).toBe(0);
  });
});
