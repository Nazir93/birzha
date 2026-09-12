import { describe, expect, it } from "vitest";

import {
  saleGrossGramsFromNet,
  sellerNetFromGrossHint,
  sellerNetKgDisplayFromGross,
  sellerNetKgFromGrossInput,
} from "./seller-gross-net.js";

describe("seller-gross-net", () => {
  it("помидоры: брутто 100 + 10 ящ → нетто 95", () => {
    expect(sellerNetKgFromGrossInput("100", 10, "Помидоры")).toBe(95);
    expect(sellerNetKgDisplayFromGross("100", "10", "Помидоры")).toBe("95");
    expect(sellerNetFromGrossHint("Помидоры")).toBe("брутто − 0,5×ящ.");
  });

  it("огурцы: брутто 100 + 10 ящ → нетто 96", () => {
    expect(sellerNetKgFromGrossInput("100", 10, "Огурцы")).toBe(96);
    expect(sellerNetKgDisplayFromGross("100", "10", "Огурцы")).toBe("96");
    expect(sellerNetFromGrossHint("Огурцы")).toBe("брутто − 0,4×ящ.");
  });

  it("без товара — тара как у помидоров (500 г)", () => {
    expect(sellerNetKgFromGrossInput("100", 10)).toBe(95);
  });

  it("0 ящиков: брутто = нетто", () => {
    expect(sellerNetKgFromGrossInput("12,5", 0, "Огурцы")).toBe(12.5);
    expect(sellerNetKgDisplayFromGross("12,5", "0")).toBe("12,5");
  });

  it("ошибка при нетто ≤ 0", () => {
    expect(() => sellerNetKgFromGrossInput("1", 2, "Помидоры")).toThrow(/нетто/i);
    expect(sellerNetKgDisplayFromGross("1", "2")).toBe("");
  });

  it("отчёт: нетто г + ящики → брутто г", () => {
    expect(saleGrossGramsFromNet(95_000n, 10n, "Помидоры")).toBe(100_000n);
    expect(saleGrossGramsFromNet(96_000n, 10n, "Огурцы")).toBe(100_000n);
    expect(saleGrossGramsFromNet(12_500n, 0n)).toBe(12_500n);
  });
});
