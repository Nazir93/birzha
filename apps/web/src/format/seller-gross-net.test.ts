import { describe, expect, it } from "vitest";

import {
  saleGrossGramsFromNet,
  saleGrossKgLabelFromNetKg,
  sellerNetKgDisplayFromGross,
  sellerNetKgFromGrossInput,
} from "./seller-gross-net.js";

describe("seller-gross-net", () => {
  it("брутто 100 + 10 ящ → нетто 95 (в API уходит нетто)", () => {
    expect(sellerNetKgFromGrossInput("100", 10)).toBe(95);
    expect(sellerNetKgDisplayFromGross("100", "10")).toBe("95");
  });

  it("0 ящиков: брутто = нетто", () => {
    expect(sellerNetKgFromGrossInput("12,5", 0)).toBe(12.5);
    expect(sellerNetKgDisplayFromGross("12,5", "0")).toBe("12,5");
  });

  it("ошибка при нетто ≤ 0", () => {
    expect(() => sellerNetKgFromGrossInput("1", 2)).toThrow(/нетто/i);
    expect(sellerNetKgDisplayFromGross("1", "2")).toBe("");
  });

  it("отчёт: нетто г + ящики → брутто г", () => {
    expect(saleGrossGramsFromNet(95_000n, 10n)).toBe(100_000n);
    expect(saleGrossGramsFromNet(12_500n, 0n)).toBe(12_500n);
    expect(saleGrossKgLabelFromNetKg(95, 10)).toBe(100);
  });
});
