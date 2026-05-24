import { describe, expect, it } from "vitest";

import { filterWholesalersForSellerPicker } from "./wholesaler-picker.js";

describe("filterWholesalersForSellerPicker", () => {
  const active = [
    { id: "w1", name: "Альфа", isActive: true },
    { id: "w2", name: "Бета", isActive: true },
  ];

  it("без поиска возвращает всех активных", () => {
    const r = filterWholesalersForSellerPicker(active, "", "");
    expect(r.rows.map((w) => w.id)).toEqual(["w1", "w2"]);
  });

  it("фильтрует по подстроке без минимума символов", () => {
    const r = filterWholesalersForSellerPicker(active, "б", "");
    expect(r.rows.map((w) => w.name)).toEqual(["Бета"]);
  });

  it("включает выбранного, даже если не в первых N", () => {
    const many = Array.from({ length: 90 }, (_, i) => ({
      id: `w${i}`,
      name: `Опт ${i}`,
      isActive: true,
    }));
    const r = filterWholesalersForSellerPicker(many, "", "w89");
    expect(r.rows[0]?.id).toBe("w89");
  });
});
