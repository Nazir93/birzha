import { describe, expect, it } from "vitest";

import { parseStoredApiMetaJson } from "./api-meta-cache.js";

describe("parseStoredApiMetaJson", () => {
  it("принимает минимально полный meta JSON", () => {
    const j = {
      name: "x",
      batchesApi: "enabled",
      tripsApi: "enabled",
      tripShipmentLedger: "enabled",
      tripSaleLedger: "enabled",
      tripShortageLedger: "enabled",
      syncApi: "disabled",
      authApi: "enabled",
      requireApiAuth: "enabled",
    };
    expect(parseStoredApiMetaJson(JSON.stringify(j))).toEqual(j);
  });

  it("отклоняет неполный JSON", () => {
    expect(parseStoredApiMetaJson(JSON.stringify({ name: "x" }))).toBeNull();
    expect(parseStoredApiMetaJson("")).toBeNull();
  });
});
