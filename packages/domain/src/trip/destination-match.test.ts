import { describe, expect, it } from "vitest";

import { tripDestinationMatchesManifest } from "./destination-match.js";

describe("tripDestinationMatchesManifest", () => {
  it("совпадает при одинаковом коде", () => {
    expect(tripDestinationMatchesManifest("moscow", "moscow")).toBe(true);
  });

  it("не совпадает при разных кодах", () => {
    expect(tripDestinationMatchesManifest("astrakhan", "moscow")).toBe(false);
  });

  it("рейс без города — совместим с любым", () => {
    expect(tripDestinationMatchesManifest(null, "moscow")).toBe(true);
    expect(tripDestinationMatchesManifest("", "moscow")).toBe(true);
    expect(tripDestinationMatchesManifest("  ", "moscow")).toBe(true);
  });

  it("обрезает пробелы", () => {
    expect(tripDestinationMatchesManifest(" moscow ", "moscow")).toBe(true);
  });
});
