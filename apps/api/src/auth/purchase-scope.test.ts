import { describe, expect, it } from "vitest";

import type { PurchaseDocumentSummary } from "../application/ports/purchase-document-repository.port.js";
import {
  filterPurchaseSummariesForPurchaserScope,
  purchaseDocumentReadableByPurchaser,
} from "./purchase-scope.js";
import type { AuthRoleGrant } from "./role-grant.js";

function globalGrant(roleCode: string): AuthRoleGrant[] {
  return [{ roleCode, scopeType: "global", scopeId: "" }];
}

describe("purchase-scope", () => {
  const docs: PurchaseDocumentSummary[] = [
    { id: "a", documentNumber: "1", docDate: "2026-01-01", warehouseId: "w", lineCount: 0, createdByUserId: null },
    { id: "b", documentNumber: "2", docDate: "2026-01-01", warehouseId: "w", lineCount: 1, createdByUserId: "u1" },
    { id: "c", documentNumber: "3", docDate: "2026-01-01", warehouseId: "w", lineCount: 1, createdByUserId: "u2" },
  ];

  it("без пользователя не режет", () => {
    expect(filterPurchaseSummariesForPurchaserScope(docs, undefined, undefined)).toEqual(docs);
  });

  it("закупщик видит без автора и только свои", () => {
    const out = filterPurchaseSummariesForPurchaserScope(docs, { roles: globalGrant("purchaser") }, "u1");
    expect(out.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("manager не режет по автору", () => {
    const out = filterPurchaseSummariesForPurchaserScope(docs, { roles: globalGrant("manager") }, "u1");
    expect(out).toEqual(docs);
  });

  it("карточка: закупщик не чужую с явным автором", () => {
    expect(
      purchaseDocumentReadableByPurchaser({ createdByUserId: "x" }, { roles: globalGrant("purchaser") }, "u1"),
    ).toBe(false);
    expect(
      purchaseDocumentReadableByPurchaser({ createdByUserId: "u1" }, { roles: globalGrant("purchaser") }, "u1"),
    ).toBe(true);
    expect(
      purchaseDocumentReadableByPurchaser({ createdByUserId: null }, { roles: globalGrant("purchaser") }, "u1"),
    ).toBe(true);
  });
});
