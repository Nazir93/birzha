import { describe, expect, it } from "vitest";

import { normalizeWarehouseName, warehouseNamesEqual } from "./warehouse-name.js";

describe("warehouse-name", () => {
  it("нормализует пробелы и регистр", () => {
    expect(normalizeWarehouseName("  Дербент  ")).toBe("дербент");
    expect(warehouseNamesEqual("Дербент", "дербент")).toBe(true);
  });
});
