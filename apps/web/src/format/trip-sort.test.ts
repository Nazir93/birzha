import { describe, expect, it } from "vitest";

import { sortTripsByDepartedDesc } from "./trip-sort.js";

describe("trip-sort", () => {
  it("sortTripsByDepartedDesc — свежие выезды выше", () => {
    const sorted = sortTripsByDepartedDesc([
      { tripNumber: "A", departedAt: "2024-01-01T00:00:00.000Z" },
      { tripNumber: "B", departedAt: "2025-06-01T00:00:00.000Z" },
    ]);
    expect(sorted.map((t) => t.tripNumber)).toEqual(["B", "A"]);
  });
});
