import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";
import { buildSellerSellChunks } from "./seller-sell-chunk-plan.js";

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

function batch(id: string, group: string, grade: string): BatchListItem {
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
      productGroup: group,
      productGradeCode: grade,
    },
  };
}

describe("buildSellerSellChunks", () => {
  const rows = [row("b-big", 20_000n), row("b-small", 5_000n)];
  const batchById = new Map<string, BatchListItem>([
    ["b-big", batch("b-big", "Томат", "6")],
    ["b-small", batch("b-small", "Томат", "6")],
  ]);

  it("одна партия — один запрос, все кг с неё", () => {
    const chunks = buildSellerSellChunks({
      sellBatchId: "b-big",
      sellableRows: rows,
      batchById,
      kg: 10,
      pricePerKg: 100,
      paymentKind: "cash",
    });
    expect(chunks).toEqual([{ batchId: "b-big", kg: 10 }]);
  });

  it("кг больше одной партии — делит по двум партиям", () => {
    const chunks = buildSellerSellChunks({
      sellBatchId: "b-big",
      sellableRows: rows,
      batchById,
      kg: 22,
      pricePerKg: 100,
      paymentKind: "cash",
    });
    expect(chunks).toEqual([
      { batchId: "b-big", kg: 20 },
      { batchId: "b-small", kg: 2 },
    ]);
  });

  it("mixed — сумма наличных по чанкам = введённой", () => {
    const chunks = buildSellerSellChunks({
      sellBatchId: "b-big",
      sellableRows: rows,
      batchById,
      kg: 22,
      pricePerKg: 100,
      paymentKind: "mixed",
      cashKopecksMixed: "50000",
    });
    expect(chunks).toHaveLength(2);
    const sumCash = chunks.reduce((s, c) => s + BigInt(c.cashKopecksMixed ?? "0"), 0n);
    expect(sumCash).toBe(50_000n);
  });

  it("card_transfer — сумма перевода по чанкам = введённой", () => {
    const chunks = buildSellerSellChunks({
      sellBatchId: "b-big",
      sellableRows: rows,
      batchById,
      kg: 22,
      pricePerKg: 100,
      paymentKind: "card_transfer",
      cardTransferKopecks: "120000",
    });
    expect(chunks).toHaveLength(2);
    const sumCard = chunks.reduce((s, c) => s + BigInt(c.cardTransferKopecks ?? "0"), 0n);
    expect(sumCard).toBe(120_000n);
  });

  it("debt — без полей оплаты в чанках", () => {
    const chunks = buildSellerSellChunks({
      sellBatchId: "b-big",
      sellableRows: rows,
      batchById,
      kg: 15,
      pricePerKg: 50,
      paymentKind: "debt",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ batchId: "b-big", kg: 15 });
  });

  it("отклоняет кг больше суммарного остатка группы", () => {
    expect(() =>
      buildSellerSellChunks({
        sellBatchId: "b-big",
        sellableRows: rows,
        batchById,
        kg: 30,
        pricePerKg: 100,
        paymentKind: "cash",
      }),
    ).toThrow(/Не больше/);
  });
});
