import { describe, expect, it } from "vitest";

import { globalRoleCodes, hasAnyGlobalRole } from "./global-roles.js";

describe("global-roles", () => {
  it("admin проходит любой набор", () => {
    expect(hasAnyGlobalRole({ roles: [{ roleCode: "admin", scopeType: "global", scopeId: "" }] }, ["seller"])).toBe(
      true,
    );
  });

  it("учитывает только глобальные гранты", () => {
    expect(
      hasAnyGlobalRole(
        { roles: [{ roleCode: "seller", scopeType: "warehouse", scopeId: "w1" }] },
        ["seller"],
      ),
    ).toBe(false);
    expect(globalRoleCodes({ roles: [{ roleCode: "seller", scopeType: "warehouse", scopeId: "w1" }] })).toEqual([]);
  });

  it("seller проходит при allowed seller", () => {
    expect(hasAnyGlobalRole({ roles: [{ roleCode: "seller", scopeType: "global", scopeId: "" }] }, ["seller"])).toBe(
      true,
    );
  });
});
