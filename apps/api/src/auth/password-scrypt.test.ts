import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password-scrypt.js";

describe("password-scrypt", () => {
  it("roundtrip", () => {
    const h = hashPassword("secret-pass");
    expect(verifyPassword("secret-pass", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });

  it("отклоняет чужой формат", () => {
    expect(verifyPassword("x", "bcrypt$foo")).toBe(false);
  });
});
