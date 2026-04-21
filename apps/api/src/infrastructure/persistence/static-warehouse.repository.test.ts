import { describe, expect, it } from "vitest";

import { WarehouseCodeConflictError } from "../../application/errors.js";

import { StaticWarehouseRepository } from "./static-warehouse.repository.js";

describe("StaticWarehouseRepository", () => {
  it("создаёт склад с автокодом и добавляет в list", async () => {
    const r = new StaticWarehouseRepository();
    const before = (await r.list()).length;
    const w = await r.create({ name: "Новый пункт" });
    expect(w.name).toBe("Новый пункт");
    expect(w.code.startsWith("WH_")).toBe(true);
    const list = await r.list();
    expect(list.length).toBe(before + 1);
    expect(list.some((x) => x.id === w.id)).toBe(true);
  });

  it("бросает при конфликте явного кода", async () => {
    const r = new StaticWarehouseRepository();
    await expect(r.create({ name: "Дубль", code: "MANAS" })).rejects.toThrow(WarehouseCodeConflictError);
  });
});
