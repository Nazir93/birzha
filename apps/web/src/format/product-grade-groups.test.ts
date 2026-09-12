import { describe, expect, it } from "vitest";

import { groupProductGradesByProduct } from "./product-grade-groups.js";

describe("groupProductGradesByProduct", () => {
  it("группирует калибры по товару", () => {
    const groups = groupProductGradesByProduct([
      {
        id: "1",
        code: "№5",
        displayName: "№5",
        productGroup: "Помидоры",
        sortOrder: 5,
      },
      {
        id: "2",
        code: "Корнишон",
        displayName: "Корнишон",
        productGroup: "Огурцы",
        sortOrder: 1,
      },
      {
        id: "3",
        code: "№6",
        displayName: "№6",
        productGroup: "Помидоры",
        sortOrder: 6,
      },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Огурцы", "Помидоры"]);
    expect(groups[0]!.grades.map((g) => g.code)).toEqual(["Корнишон"]);
    expect(groups[1]!.grades.map((g) => g.code)).toEqual(["№5", "№6"]);
  });
});
