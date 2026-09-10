import { describe, expect, it } from "vitest";

import { ProductGradeCodeConflictError } from "../../application/errors.js";

import { StaticProductGradeRepository } from "./static-product-grade.repository.js";

describe("StaticProductGradeRepository", () => {
  it("создаёт калибр и возвращает в list", async () => {
    const r = new StaticProductGradeRepository();
    const before = (await r.list()).length;
    const g = await r.create({
      code: "№9",
      displayName: "Калибр №9",
      sortOrder: 9,
      productGroup: "Помидоры",
    });
    expect(g.code).toBe("№9");
    const list = await r.list();
    expect(list.length).toBe(before + 1);
    expect(list.some((x) => x.id === g.id)).toBe(true);
  });

  it("бросает при конфликте кода внутри того же товара", async () => {
    const r = new StaticProductGradeRepository();
    await expect(
      r.create({ code: "№5", displayName: "Дубль", productGroup: "Помидоры" }),
    ).rejects.toThrow(ProductGradeCodeConflictError);
  });

  it("разрешает одинаковый код у разных товаров", async () => {
    const r = new StaticProductGradeRepository();
    const g = await r.create({
      code: "НС+",
      displayName: "НС+ тест",
      productGroup: "Перец",
    });
    expect(g.productGroup).toBe("Перец");
    expect(g.code).toBe("НС+");
  });

  it("сид содержит огурцы с НС+ параллельно помидорам", async () => {
    const r = new StaticProductGradeRepository();
    const list = await r.list();
    const tomatoNs = list.find((g) => g.productGroup === "Помидоры" && g.code === "НС+");
    const cucumberNs = list.find((g) => g.productGroup === "Огурцы" && g.code === "НС+");
    expect(tomatoNs).toBeDefined();
    expect(cucumberNs).toBeDefined();
    expect(list.filter((g) => g.productGroup === "Огурцы")).toHaveLength(6);
  });
});
