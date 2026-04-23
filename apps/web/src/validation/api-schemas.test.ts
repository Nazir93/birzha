import { describe, expect, it } from "vitest";

import {
  parseCreateBatchForm,
  parseCreatePurchaseDocumentForm,
  parseReceiveForm,
  parseSellFromTripForm,
} from "./api-schemas.js";

describe("parseCreateBatchForm", () => {
  it("принимает валидные числа с запятой", () => {
    const r = parseCreateBatchForm({
      batchId: "b1",
      purchaseId: "p1",
      totalKg: "10,5",
      pricePerKg: "0",
      distribution: "on_hand",
    });
    expect(r.totalKg).toBe(10.5);
    expect(r.pricePerKg).toBe(0);
  });

  it("бросает на невалидном totalKg", () => {
    expect(() =>
      parseCreateBatchForm({
        batchId: "b1",
        purchaseId: "p1",
        totalKg: "0",
        pricePerKg: "1",
        distribution: "on_hand",
      }),
    ).toThrow();
  });
});

describe("parseCreatePurchaseDocumentForm", () => {
  it("собирает тело накладной", () => {
    const body = parseCreatePurchaseDocumentForm({
      documentId: "",
      documentNumber: "НФ-1",
      docDate: "2026-04-16",
      warehouseId: "wh-manas",
      supplierName: "Поставщик",
      buyerLabel: "",
      extraCostKopecks: "0",
      lines: [
        {
          productGradeId: "pg-n5",
          totalKg: "10",
          packageCount: "2",
          pricePerKg: "50",
          lineTotalKopecks: "50000",
        },
      ],
    });
    expect(body.documentNumber).toBe("НФ-1");
    expect(body.lines[0]?.lineTotalKopecks).toBe(50_000);
    expect(body.lines[0]?.packageCount).toBe(2);
  });

  it("короба с запятой округляются до целого", () => {
    const body = parseCreatePurchaseDocumentForm({
      documentId: "",
      documentNumber: "НФ-1",
      docDate: "2026-04-16",
      warehouseId: "wh-1",
      supplierName: "",
      buyerLabel: "",
      extraCostKopecks: "0",
      lines: [
        {
          productGradeId: "pg-1",
          totalKg: "1",
          packageCount: "2,4",
          pricePerKg: "0",
          lineTotalKopecks: "0",
        },
      ],
    });
    expect(body.lines[0]?.packageCount).toBe(2);
  });

  it("сумма строки «руб,коп» в точные копейки без float", () => {
    const body = parseCreatePurchaseDocumentForm({
      documentId: "",
      documentNumber: "НФ-1",
      docDate: "2026-04-16",
      warehouseId: "wh-1",
      supplierName: "",
      buyerLabel: "",
      extraCostKopecks: "100,50",
      lines: [
        {
          productGradeId: "pg-1",
          totalKg: "1",
          packageCount: "0",
          pricePerKg: "0",
          lineTotalKopecks: "32232,77",
        },
      ],
    });
    expect(body.lines[0]?.lineTotalKopecks).toBe(3_223_277);
    expect(body.extraCostKopecks).toBe(10_050);
  });
});

describe("parseReceiveForm", () => {
  it("требует непустой batchId", () => {
    expect(() => parseReceiveForm("", "10")).toThrow();
  });
});

describe("parseSellFromTripForm", () => {
  it("требует cashKopecksMixed при mixed", () => {
    expect(() =>
      parseSellFromTripForm({
        batchId: "b",
        tripId: "t",
        kg: "1",
        saleId: "s",
        pricePerKg: "10",
        paymentKind: "mixed",
        cashMixed: "",
      }),
    ).toThrow();
  });
});
