import { describe, expect, it } from "vitest";

import { parseReplacePurchaseDocumentLinesForm } from "./api-schemas.js";

describe("parseReplacePurchaseDocumentLinesForm", () => {
  it("принимает batchId и сумму в руб,коп (сумма от нетто)", () => {
    const body = parseReplacePurchaseDocumentLinesForm([
      {
        batchId: "b1",
        productGradeId: "pg-n5",
        grossKg: "10",
        packageCount: "2",
        pricePerKg: "50",
        /** нетто 9 × 50 = 450 ₽ */
        lineTotalKopecks: "450,00",
      },
    ]);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.batchId).toBe("b1");
    expect(body.lines[0]?.grossKg).toBe(10);
    expect(body.lines[0]?.lineTotalKopecks).toBe(45_000);
  });

  it("отклоняет нетто ≤ 0", () => {
    expect(() =>
      parseReplacePurchaseDocumentLinesForm([
        {
          productGradeId: "pg-n5",
          grossKg: "1",
          packageCount: "3",
          pricePerKg: "10",
          lineTotalKopecks: "0",
        },
      ]),
    ).toThrow(/нетто/i);
  });
});
