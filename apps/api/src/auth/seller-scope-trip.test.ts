import { describe, expect, it } from "vitest";

import { Trip } from "@birzha/domain";

import { tripVisibleToFieldSeller } from "./seller-scope.js";

describe("tripVisibleToFieldSeller", () => {
  it("общий рейс (без назначения) не виден полевому продавцу", () => {
    const t = Trip.create({ id: "t1", tripNumber: "Ф-1" });
    expect(tripVisibleToFieldSeller(t, "u1")).toBe(false);
  });

  it("закреплённый рейс видит только назначенный", () => {
    const t = Trip.create({ id: "t2", tripNumber: "Ф-2", assignedSellerUserId: "alice" });
    expect(tripVisibleToFieldSeller(t, "alice")).toBe(true);
    expect(tripVisibleToFieldSeller(t, "bob")).toBe(false);
  });
});
