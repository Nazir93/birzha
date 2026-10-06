import { describe, expect, it } from "vitest";

import { rubStringToPaymentKopecks } from "./debt-payment-rub.js";

describe("rubStringToPaymentKopecks", () => {
  it("парсит рубли с запятой и точкой", () => {
    expect(rubStringToPaymentKopecks("100")).toBe(10000);
    expect(rubStringToPaymentKopecks("12,50")).toBe(1250);
    expect(rubStringToPaymentKopecks("12.5")).toBe(1250);
  });

  it("отклоняет пустое и неположительное", () => {
    expect(() => rubStringToPaymentKopecks("")).toThrow(/рубл/i);
    expect(() => rubStringToPaymentKopecks("0")).toThrow(/рубл/i);
    expect(() => rubStringToPaymentKopecks("-1")).toThrow(/рубл/i);
  });
});
