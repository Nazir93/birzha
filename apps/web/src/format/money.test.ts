import { describe, expect, it } from "vitest";

import { gramsToKgLabel, kopecksToRubDisplay, kopecksToRubLabel } from "./money.js";

describe("money format", () => {
  it("kopecksToRubLabel", () => {
    expect(kopecksToRubLabel("0")).toBe("0,00");
    expect(kopecksToRubLabel("12345")).toBe("123,45");
    expect(kopecksToRubLabel("5")).toBe("0,05");
    expect(kopecksToRubLabel("-100")).toBe("-1,00");
  });

  it("kopecksToRubDisplay — пробелы в рублях", () => {
    expect(kopecksToRubDisplay("2200000")).toBe("22 000,00");
    expect(kopecksToRubDisplay("800000")).toBe("8 000,00");
  });

  it("gramsToKgLabel", () => {
    expect(gramsToKgLabel("0")).toBe("0,000");
    expect(gramsToKgLabel("12345")).toBe("12,345");
    expect(gramsToKgLabel("100")).toBe("0,100");
    expect(gramsToKgLabel("-1500")).toBe("-1,500");
  });
});
