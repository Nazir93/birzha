import { describe, expect, it } from "vitest";

import {
  conflictingBatchProduct,
  effectiveTripProductGroup,
  tripProductMismatchMessage,
} from "./trip-product-match.js";

describe("trip product match", () => {
  it("рейс без товара считается помидорами", () => {
    expect(effectiveTripProductGroup(null)).toBe("Помидоры");
    expect(effectiveTripProductGroup("  ")).toBe("Помидоры");
    expect(effectiveTripProductGroup("Огурцы")).toBe("Огурцы");
  });

  it("помидоры не грузятся на рейс огурцов", () => {
    expect(conflictingBatchProduct("Огурцы", ["Помидоры"])).toBe("Помидоры");
    expect(conflictingBatchProduct("Помидоры", ["Огурцы", "Помидоры"])).toBe("Огурцы");
  });

  it("тот же товар и пустая партия — без конфликта", () => {
    expect(conflictingBatchProduct("Огурцы", ["Огурцы", null, ""])).toBeNull();
    expect(conflictingBatchProduct(null, ["Помидоры"])).toBeNull();
  });

  it("сообщение называет оба товара", () => {
    expect(tripProductMismatchMessage("Огурцы", "Помидоры")).toContain("Огурцы");
    expect(tripProductMismatchMessage("Огурцы", "Помидоры")).toContain("Помидоры");
  });
});
