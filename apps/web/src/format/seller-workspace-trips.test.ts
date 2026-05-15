import { describe, expect, it } from "vitest";

import { TRIP_STATUS_CLOSED, isTripOpenForSellerWorkspace } from "./seller-workspace-trips.js";

describe("seller-workspace-trips", () => {
  it("закрытый рейс не считается открытым для рабочего кабинета", () => {
    expect(isTripOpenForSellerWorkspace({ status: TRIP_STATUS_CLOSED })).toBe(false);
    expect(isTripOpenForSellerWorkspace({ status: "open" })).toBe(true);
  });
});
