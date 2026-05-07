import { describe, expect, it } from "vitest";

import { formatMutationErrorMessage } from "./mutation-error-bus.js";

describe("formatMutationErrorMessage", () => {
  it("берёт message у Error", () => {
    expect(formatMutationErrorMessage(new Error("сеть"))).toBe("сеть");
  });

  it("строка как есть", () => {
    expect(formatMutationErrorMessage("timeout")).toBe("timeout");
  });
});
