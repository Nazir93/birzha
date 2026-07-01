import { describe, expect, it } from "vitest";

import { sumKopecksField } from "./stock-balances-http.js";

describe("sumKopecksField", () => {
  it("суммирует bigint и строки, не конкатенируя", () => {
    let acc = 0n;
    acc = sumKopecksField(acc, 2_500_000n);
    acc = sumKopecksField(acc, "1630000");
    acc = sumKopecksField(acc, 141600);
    expect(acc).toBe(4_271_600n);
  });

  it("игнорирует null и undefined", () => {
    expect(sumKopecksField(100n, null)).toBe(100n);
    expect(sumKopecksField(100n, undefined)).toBe(100n);
  });
});
