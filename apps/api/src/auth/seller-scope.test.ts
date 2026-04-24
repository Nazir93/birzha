import { describe, expect, it } from "vitest";

import { isGlobalSellerOnly } from "./seller-scope.js";
import type { AuthRoleGrant } from "./role-grant.js";

function g(...codes: string[]): AuthRoleGrant[] {
  return codes.map((roleCode) => ({ roleCode, scopeType: "global" as const, scopeId: "" }));
}

describe("isGlobalSellerOnly", () => {
  it("только seller — true", () => {
    expect(isGlobalSellerOnly(g("seller"))).toBe(true);
  });

  it("seller+warehouse — не только продавец", () => {
    expect(isGlobalSellerOnly(g("seller", "warehouse"))).toBe(false);
  });

  it("логист — false", () => {
    expect(isGlobalSellerOnly(g("seller", "logistics"))).toBe(false);
  });
});
