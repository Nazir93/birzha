import { describe, expect, it } from "vitest";

import { formatPurchaseDocDateRu, parseDocDateToIso } from "./purchase-doc-date.js";

describe("formatPurchaseDocDateRu", () => {
  it("показывает день.месяц.год", () => {
    expect(formatPurchaseDocDateRu("2026-07-13")).toBe("13.07.2026");
    expect(formatPurchaseDocDateRu("2026-01-05")).toBe("05.01.2026");
  });

  it("пустая — прочерк", () => {
    expect(formatPurchaseDocDateRu("")).toBe("—");
    expect(formatPurchaseDocDateRu("   ")).toBe("—");
  });
});

describe("parseDocDateToIso", () => {
  it("из ДД.ММ.ГГГГ", () => {
    expect(parseDocDateToIso("13.07.2026")).toBe("2026-07-13");
    expect(parseDocDateToIso("5.1.2026")).toBe("2026-01-05");
  });

  it("пропускает уже ISO", () => {
    expect(parseDocDateToIso("2026-07-13")).toBe("2026-07-13");
  });
});
