import { describe, expect, it } from "vitest";

import { ProductGradeCodeConflictError } from "../../application/errors.js";

import { StaticProductGradeRepository } from "./static-product-grade.repository.js";

describe("StaticProductGradeRepository", () => {
  it("создаёт калибр и возвращает в list", async () => {
    const r = new StaticProductGradeRepository();
    const before = (await r.list()).length;
    const g = await r.create({ code: "№9", displayName: "Калибр №9", sortOrder: 9 });
    expect(g.code).toBe("№9");
    const list = await r.list();
    expect(list.length).toBe(before + 1);
    expect(list.some((x) => x.id === g.id)).toBe(true);
  });

  it("бросает при конфликте кода", async () => {
    const r = new StaticProductGradeRepository();
    await expect(r.create({ code: "№5", displayName: "Дубль" })).rejects.toThrow(ProductGradeCodeConflictError);
  });
});
