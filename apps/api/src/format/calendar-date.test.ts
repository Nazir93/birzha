import { describe, expect, it } from "vitest";

import { calendarYmdFromDate, parseCalendarYmdUtcNoon } from "./calendar-date.js";

describe("calendarYmdFromDate", () => {
  it("полдень UTC остаётся тем же днём", () => {
    expect(calendarYmdFromDate(parseCalendarYmdUtcNoon("2026-10-04"))).toBe("2026-10-04");
  });

  it("полночь UTC не сдвигается", () => {
    expect(calendarYmdFromDate(new Date("2026-10-04T00:00:00.000Z"))).toBe("2026-10-04");
  });
});
