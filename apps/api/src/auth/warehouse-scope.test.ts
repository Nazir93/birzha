import { describe, expect, it } from "vitest";

import { warehouseReadScopeIds } from "./warehouse-scope.js";

function roles(
  rs: { roleCode: string; scopeType: string; scopeId: string }[],
): { roles: typeof rs } {
  return { roles: rs };
}

describe("warehouseReadScopeIds", () => {
  it("admin и manager — без ограничения", () => {
    expect(warehouseReadScopeIds(roles([{ roleCode: "admin", scopeType: "global", scopeId: "" }]))).toBeNull();
    expect(warehouseReadScopeIds(roles([{ roleCode: "manager", scopeType: "global", scopeId: "" }]))).toBeNull();
  });

  it("warehouse с scope warehouse — только эти склады", () => {
    const s = warehouseReadScopeIds(
      roles([
        { roleCode: "warehouse", scopeType: "warehouse", scopeId: "wh-1" },
        { roleCode: "warehouse", scopeType: "warehouse", scopeId: "wh-2" },
      ]),
    );
    expect(s).not.toBeNull();
    expect([...(s as Set<string>).values()].sort()).toEqual(["wh-1", "wh-2"]);
  });

  it("глобальный warehouse без scope — null", () => {
    expect(
      warehouseReadScopeIds(roles([{ roleCode: "warehouse", scopeType: "global", scopeId: "" }])),
    ).toBeNull();
  });
});
