import { describe, expect, it } from "vitest";

import { distributeIntegersProRata } from "./distribute-integers-pro-rata.js";

describe("distributeIntegersProRata", () => {
  it("сохраняет сумму", () => {
    const w = [10, 30, 60];
    const t = 100;
    const r = distributeIntegersProRata(w, t);
    expect(r.reduce((a, b) => a + b, 0)).toBe(t);
  });

  it("простое соотношение 1:1:1", () => {
    const r = distributeIntegersProRata([1, 1, 1], 12);
    expect(r).toEqual([4, 4, 4]);
  });

  it("ноль веса даёт 0", () => {
    const r = distributeIntegersProRata([0, 100], 5);
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(5);
  });

  it("NaN и отрицательные веса обнуляются", () => {
    const r = distributeIntegersProRata([Number.NaN, -1, 10], 7);
    expect(r[0]).toBe(0);
    expect(r[1]).toBe(0);
    expect(r[2]).toBe(7);
  });
});
