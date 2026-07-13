import { describe, expect, it } from "vitest";

import { parseReplacePurchaseDocumentLinesForm } from "./api-schemas.js";

describe("parseReplacePurchaseDocumentLinesForm", () => {
  it("принимает batchId и сумму в руб,коп", () => {
    const body = parseReplacePurchaseDocumentLinesForm([
      {
        batchId: "b1",
        productGradeId: "pg-n5",
        totalKg: "10",
        packageCount: "2",
        pricePerKg: "50",
        lineTotalKopecks: "500,00",
      },
    ]);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.batchId).toBe("b1");
    expect(body.lines[0]?.lineTotalKopecks).toBe(50_000);
  });
});
