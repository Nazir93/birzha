import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";

import { sellerCaliberTileHeadline, sellerCaliberTileSubline } from "./seller-caliber-tile-label.js";

const BATCH_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

function batch(partial: Partial<BatchListItem> & Pick<BatchListItem, "id">): BatchListItem {
  return {
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 0,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "d1",
      documentNumber: "Н-42",
      warehouseId: "w1",
      productGroup: "Томат",
      productGradeCode: "57",
    },
    ...partial,
  };
}

function expectNoTechnicalId(label: string) {
  expect(label).not.toContain(BATCH_UUID);
  expect(label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  expect(label).not.toMatch(/…/);
}

describe("sellerCaliberTileHeadline", () => {
  it("показывает товар и калибр", () => {
    const label = sellerCaliberTileHeadline(batch({ id: BATCH_UUID }));
    expect(label).toBe("Томат · 57");
    expectNoTechnicalId(label);
  });

  it("без вида/калибра — номер накладной", () => {
    const b = batch({ id: BATCH_UUID });
    b.nakladnaya!.productGroup = "";
    b.nakladnaya!.productGradeCode = "";
    const label = sellerCaliberTileHeadline(b);
    expect(label).toBe("№ Н-42");
    expectNoTechnicalId(label);
  });

  it("без накладной — нейтральная подпись «Калибр»", () => {
    const label = sellerCaliberTileHeadline(undefined);
    expect(label).toBe("Калибр");
    expectNoTechnicalId(label);
  });
});

describe("sellerCaliberTileSubline", () => {
  it("дубли калибра — номер накладной", () => {
    const sub = sellerCaliberTileSubline(batch({ id: BATCH_UUID }));
    expect(sub).toBe("накл. № Н-42");
    expectNoTechnicalId(sub!);
  });

  it("без номера накладной — без id", () => {
    const b = batch({ id: BATCH_UUID });
    b.nakladnaya!.documentNumber = "";
    const sub = sellerCaliberTileSubline(b);
    expect(sub).toBe("ещё одна партия");
    expectNoTechnicalId(sub!);
  });
});
