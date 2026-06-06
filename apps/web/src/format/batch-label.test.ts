import { describe, expect, it } from "vitest";

import { productGradeOptionLabel, salesCaliberLineLabel } from "./batch-label.js";

describe("productGradeOptionLabel", () => {
  it("не дублирует одинаковые код и название", () => {
    expect(productGradeOptionLabel("HC+", "HC+")).toBe("HC+");
    expect(productGradeOptionLabel("Ом.", "Ом.")).toBe("Ом.");
  });

  it("код вместо «Калибр №5»", () => {
    expect(productGradeOptionLabel("№5", "Калибр №5")).toBe("№5");
  });

  it("оставляет разные код и название", () => {
    expect(productGradeOptionLabel("X", "Экстра")).toBe("X — Экстра");
  });
});

describe("salesCaliberLineLabel", () => {
  it("не показывает сырой id:uuid", () => {
    expect(salesCaliberLineLabel(undefined, "id:7af272ff-dda8-45c2-8b6c-450228410596")).toBe(
      "Партия без данных накладной",
    );
  });

  it("показывает товар · калибр при партии без накладной", () => {
    expect(
      salesCaliberLineLabel(
        { id: "b1", purchaseId: "", totalKg: 0, pricePerKg: 0, pendingInboundKg: 0, onWarehouseKg: 0, inTransitKg: 0, soldKg: 0, writtenOffKg: 0 },
        "id:b1",
      ),
    ).toBe("Товар · калибр не указан");
  });
});
