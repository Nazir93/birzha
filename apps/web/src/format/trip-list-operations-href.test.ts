import { describe, expect, it } from "vitest";

import { adminRoutes, ops } from "../routes.js";
import { tripListOperationsHref } from "./trip-list-operations-href.js";

describe("tripListOperationsHref", () => {
  it("в кабинете /o ведёт на погрузку", () => {
    expect(tripListOperationsHref("/o/trips")).toBe(ops.distribution);
  });

  it("в кабинете /a ведёт на погрузку админки", () => {
    expect(tripListOperationsHref("/a/trips")).toBe(adminRoutes.distribution);
  });

  it("не ведёт на недостачу", () => {
    expect(tripListOperationsHref("/o/trips")).not.toBe(ops.operations);
    expect(tripListOperationsHref("/a/trips")).not.toBe(adminRoutes.operations);
  });
});
