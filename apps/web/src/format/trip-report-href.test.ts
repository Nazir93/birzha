import { describe, expect, it } from "vitest";

import { tripReportHref } from "./trip-report-href.js";

describe("tripReportHref", () => {
  it("без рейса — только путь отчётов", () => {
    expect(tripReportHref("/a/reports")).toBe("/a/reports");
    expect(tripReportHref("/a/reports", "  ")).toBe("/a/reports");
  });

  it("с рейсом — query trip", () => {
    expect(tripReportHref("/a/reports", "trip-1")).toBe("/a/reports?trip=trip-1");
  });
});
