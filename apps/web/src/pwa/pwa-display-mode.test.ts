import { describe, expect, it } from "vitest";

import { isIosSafariNotStandalone, isPwaStandalone, isSellerCabinetPath } from "./pwa-display-mode.js";

describe("isSellerCabinetPath", () => {
  it("распознаёт /s и вложенные пути", () => {
    expect(isSellerCabinetPath("/s")).toBe(true);
    expect(isSellerCabinetPath("/s/sell")).toBe(true);
    expect(isSellerCabinetPath("/o")).toBe(false);
    expect(isSellerCabinetPath("/login")).toBe(false);
  });
});

describe("isPwaStandalone", () => {
  it("false без window (SSR/тест)", () => {
    expect(isPwaStandalone()).toBe(false);
  });
});

describe("isIosSafariNotStandalone", () => {
  it("false без navigator", () => {
    expect(isIosSafariNotStandalone()).toBe(false);
  });
});
