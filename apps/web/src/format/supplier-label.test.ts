import { describe, expect, it } from "vitest";

import {
  formatSupplierPurchaseLabel,
  formatSupplierPurchaseNumber,
  suggestNextSupplierPurchaseNumber,
} from "./supplier-label.js";

describe("formatSupplierPurchaseNumber", () => {
  it("паддит до двух цифр", () => {
    expect(formatSupplierPurchaseNumber(1)).toBe("01");
    expect(formatSupplierPurchaseNumber(12)).toBe("12");
  });
});

describe("formatSupplierPurchaseLabel", () => {
  it("склеивает номер накладной и имя", () => {
    expect(formatSupplierPurchaseLabel("01", "Мурад")).toBe("01 · Мурад");
    expect(formatSupplierPurchaseLabel("3 · старое", "Мурад")).toBe("03 · Мурад");
  });

  it("без цифр в номере — номер накладной как есть", () => {
    expect(formatSupplierPurchaseLabel("Мурад · 01.01.2026", "Мурад")).toBe("Мурад · 01.01.2026");
  });

  it("только номер без имени", () => {
    expect(formatSupplierPurchaseLabel("01", null)).toBe("01");
  });
});

describe("suggestNextSupplierPurchaseNumber", () => {
  it("отдельный счётчик на каждого тепличника", () => {
    const docs = [
      { documentNumber: "01", supplierId: "s-murad", supplierName: "Мурад" },
      { documentNumber: "02", supplierId: "s-murad", supplierName: "Мурад" },
      { documentNumber: "01", supplierId: "s-umar", supplierName: "Умар" },
    ];
    expect(suggestNextSupplierPurchaseNumber(docs, "s-murad")).toBe("03");
    expect(suggestNextSupplierPurchaseNumber(docs, "s-umar")).toBe("02");
    expect(suggestNextSupplierPurchaseNumber(docs, "s-new", "Новый")).toBe("01");
  });

  it("старые накладные без цифры увеличивают счётчик", () => {
    const docs = [
      { documentNumber: "Мурад · 01.01.2026", supplierId: "s1", supplierName: "Мурад" },
      { documentNumber: "Мурад · 02.01.2026", supplierId: "s1", supplierName: "Мурад" },
    ];
    expect(suggestNextSupplierPurchaseNumber(docs, "s1")).toBe("03");
  });
});
