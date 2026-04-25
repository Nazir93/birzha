import { describe, expect, it } from "vitest";

import { postWarehouseWriteOffBodySchema } from "./warehouse-write-off.js";

describe("postWarehouseWriteOffBodySchema", () => {
  it("парсит quality_reject и кг", () => {
    const r = postWarehouseWriteOffBodySchema.parse({ kind: "quality_reject", kg: 1.5 });
    expect(r.kg).toBe(1.5);
  });

  it("отклоняет неположительный кг", () => {
    expect(() => postWarehouseWriteOffBodySchema.parse({ kind: "quality_reject", kg: 0 })).toThrow();
  });
});
