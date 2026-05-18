import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import { parseSellFromTripForm } from "../validation/api-schemas.js";
import { buildSellerSellChunks } from "./seller-sell-chunk-plan.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";

function row(batchId: string, netG: bigint): TripBatchTableRow {
  return {
    batchId,
    shippedG: netG,
    shippedPackages: 0n,
    soldG: 0n,
    shortageG: 0n,
    netTransitG: netG,
    revenueK: 0n,
    cashK: 0n,
    debtK: 0n,
    cardTransferK: 0n,
  };
}

function batch(id: string): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 0,
    inTransitKg: 10,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "d1",
      documentNumber: "Н-1",
      warehouseId: "w1",
      productGroup: "Томат",
      productGradeCode: "6",
    },
  };
}

/** Сквозная проверка: форма продавца (рубли) → тело API → чанки по партиям. */
describe("seller payment save flow", () => {
  const sellableRows = [row("b1", 10_000n), row("b2", 5_000n)];
  const batchById = new Map([
    ["b1", batch("b1")],
    ["b2", batch("b2")],
  ]);

  it("наличными целиком — один чанк", () => {
    const { batchId, body } = parseSellFromTripForm({
      batchId: "b1",
      tripId: "t1",
      kg: "5",
      saleId: "sale-1",
      pricePerKg: "80",
      paymentKind: "cash",
      cashMixed: "",
      sellerMoneyInRubles: true,
    });
    const chunks = buildSellerSellChunks({
      sellBatchId: batchId,
      sellableRows,
      batchById,
      kg: body.kg,
      pricePerKg: body.pricePerKg,
      paymentKind: "cash",
    });
    expect(chunks).toEqual([{ batchId: "b1", kg: 5 }]);
    expect(body.paymentKind).toBe("cash");
  });

  it("в долг — один чанк", () => {
    const { body } = parseSellFromTripForm({
      batchId: "b1",
      tripId: "t1",
      kg: "5",
      saleId: "sale-1",
      pricePerKg: "80",
      paymentKind: "debt",
      cashMixed: "",
      sellerMoneyInRubles: true,
    });
    const chunks = buildSellerSellChunks({
      sellBatchId: "b1",
      sellableRows,
      batchById,
      kg: body.kg,
      pricePerKg: body.pricePerKg,
      paymentKind: "debt",
    });
    expect(chunks).toHaveLength(1);
    expect(body.paymentKind).toBe("debt");
  });

  it("нал + долг — копейки наличных на чанках суммируются", () => {
    const { body } = parseSellFromTripForm({
      batchId: "b1",
      tripId: "t1",
      kg: "12",
      saleId: "sale-1",
      pricePerKg: "100",
      paymentKind: "mixed",
      cashMixed: "500",
      sellerMoneyInRubles: true,
    });
    expect(body.cashKopecksMixed).toBe("50000");
    const chunks = buildSellerSellChunks({
      sellBatchId: "b1",
      sellableRows,
      batchById,
      kg: body.kg,
      pricePerKg: body.pricePerKg,
      paymentKind: "mixed",
      cashKopecksMixed: String(body.cashKopecksMixed),
    });
    expect(chunks.length).toBeGreaterThan(1);
    const sumCash = chunks.reduce((s, c) => s + BigInt(c.cashKopecksMixed ?? "0"), 0n);
    expect(sumCash).toBe(50_000n);
  });

  it("карта + нал — копейки перевода на чанках суммируются", () => {
    const { body } = parseSellFromTripForm({
      batchId: "b1",
      tripId: "t1",
      kg: "12",
      saleId: "sale-1",
      pricePerKg: "100",
      paymentKind: "card_transfer",
      cashMixed: "",
      cardTransferKopecks: "300",
      sellerMoneyInRubles: true,
    });
    expect(body.cardTransferKopecks).toBe("30000");
    const chunks = buildSellerSellChunks({
      sellBatchId: "b1",
      sellableRows,
      batchById,
      kg: body.kg,
      pricePerKg: body.pricePerKg,
      paymentKind: "card_transfer",
      cardTransferKopecks: String(body.cardTransferKopecks),
    });
    expect(chunks.length).toBeGreaterThan(1);
    const sumCard = chunks.reduce((s, c) => s + BigInt(c.cardTransferKopecks ?? "0"), 0n);
    expect(sumCard).toBe(30_000n);
  });
});
