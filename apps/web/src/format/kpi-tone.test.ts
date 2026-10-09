import { describe, expect, it } from "vitest";

import { kpiToneForSignedKopecks } from "./kpi-tone.js";

describe("kpiToneForSignedKopecks", () => {
  it("прибыль и ноль — зелёный", () => {
    expect(kpiToneForSignedKopecks("100")).toBe("birzha-kpi-tile--tone-good");
    expect(kpiToneForSignedKopecks("0")).toBe("birzha-kpi-tile--tone-good");
  });

  it("убыль — красный", () => {
    expect(kpiToneForSignedKopecks("-1")).toBe("birzha-kpi-tile--tone-bad");
    expect(kpiToneForSignedKopecks("-50000")).toBe("birzha-kpi-tile--tone-bad");
  });
});
