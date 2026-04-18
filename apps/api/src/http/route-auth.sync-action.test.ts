import { describe, expect, it } from "vitest";

import { userMayPerformSyncAction } from "./route-auth.js";

function userWithRoles(...roleCodes: string[]) {
  return {
    roles: roleCodes.map((roleCode) => ({ roleCode, scopeType: "global" as const, scopeId: "" })),
  };
}

describe("userMayPerformSyncAction", () => {
  it("продавец — только sell_from_trip", () => {
    const u = userWithRoles("seller");
    expect(userMayPerformSyncAction(u, "sell_from_trip")).toBe(true);
    expect(userMayPerformSyncAction(u, "create_trip")).toBe(false);
    expect(userMayPerformSyncAction(u, "ship_to_trip")).toBe(false);
  });

  it("бухгалтер — ни одного мутационного sync-действия", () => {
    const u = userWithRoles("accountant");
    expect(userMayPerformSyncAction(u, "sell_from_trip")).toBe(false);
    expect(userMayPerformSyncAction(u, "receive_on_warehouse")).toBe(false);
  });

  it("кладовщик — receive и ship, не create_trip", () => {
    const u = userWithRoles("warehouse");
    expect(userMayPerformSyncAction(u, "receive_on_warehouse")).toBe(true);
    expect(userMayPerformSyncAction(u, "ship_to_trip")).toBe(true);
    expect(userMayPerformSyncAction(u, "create_trip")).toBe(false);
  });

  it("логист — create_trip и ship", () => {
    const u = userWithRoles("logistics");
    expect(userMayPerformSyncAction(u, "create_trip")).toBe(true);
    expect(userMayPerformSyncAction(u, "ship_to_trip")).toBe(true);
    expect(userMayPerformSyncAction(u, "sell_from_trip")).toBe(false);
  });
});
