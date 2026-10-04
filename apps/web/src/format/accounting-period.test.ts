import { describe, expect, it } from "vitest";

import {
  accountingMonthBounds,
  accountingPathWithPeriod,
  readAccountingPeriodParams,
} from "./accounting-period.js";

describe("accounting-period", () => {
  it("границы октября 2026", () => {
    expect(accountingMonthBounds(new Date("2026-10-15T12:00:00.000Z"))).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("путь с периодом", () => {
    expect(accountingPathWithPeriod("/b/rent", "2026-10-01", "2026-10-31")).toBe(
      "/b/rent?from=2026-10-01&to=2026-10-31",
    );
  });

  it("читает from/to из query, иначе fallback", () => {
    const fallback = { from: "2026-01-01", to: "2026-01-31" };
    expect(readAccountingPeriodParams(new URLSearchParams("from=2026-10-01&to=2026-10-15"), fallback)).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(readAccountingPeriodParams(new URLSearchParams(""), fallback)).toEqual(fallback);
  });
});
