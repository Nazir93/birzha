import { describe, expect, it } from "vitest";

import { formatSupplierLabel, formatSupplierNumber } from "./supplier-label.js";

describe("formatSupplierNumber", () => {
  it("паддит до двух цифр", () => {
    expect(formatSupplierNumber(1)).toBe("01");
    expect(formatSupplierNumber(12)).toBe("12");
  });

  it("пустая строка без номера", () => {
    expect(formatSupplierNumber(0)).toBe("");
    expect(formatSupplierNumber(null)).toBe("");
  });
});

describe("formatSupplierLabel", () => {
  it("склеивает номер и имя", () => {
    expect(formatSupplierLabel("Дадай пр", 5)).toBe("05 · Дадай пр");
  });

  it("без номера — только имя", () => {
    expect(formatSupplierLabel("Москва", 0)).toBe("Москва");
  });
});
