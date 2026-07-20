import { describe, expect, it } from "vitest";

import { ResourceInUseError } from "../application/errors.js";

describe("ResourceInUseError ship_destination", () => {
  it("принимает код ship_destination", () => {
    const err = new ResourceInUseError("ship_destination", "Город используется");
    expect(err.code).toBe("ship_destination");
    expect(err.message).toContain("используется");
  });
});
