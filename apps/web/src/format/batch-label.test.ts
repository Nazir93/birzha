import { describe, expect, it } from "vitest";

import { productGradeOptionLabel } from "./batch-label.js";

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
