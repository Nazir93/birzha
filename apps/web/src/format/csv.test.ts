import { describe, expect, it } from "vitest";

import { escapeCsvField, tripBatchRowsToCsv } from "./csv.js";
import type { TripBatchTableRow } from "./trip-report-rows.js";

describe("escapeCsvField", () => {
  it("не меняет простой текст", () => {
    expect(escapeCsvField("abc")).toBe("abc");
  });

  it("оборачивает в кавычки при ; и переводах строк", () => {
    expect(escapeCsvField('say "hi"')).toBe(`"say ""hi"""`);
    expect(escapeCsvField("a;b")).toBe(`"a;b"`);
  });
});

describe("tripBatchRowsToCsv", () => {
  it("добавляет BOM и строку заголовков", () => {
    const rows: TripBatchTableRow[] = [
      {
        batchId: "b-1",
        shippedG: 1000n,
        shippedPackages: 2n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 1000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
      },
    ];
    const csv = tripBatchRowsToCsv(rows, { tripNumber: "Т-1", tripId: "tid" });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Рейс;Т-1");
    expect(csv).toContain("b-1;1000;2");
  });

  it("добавляет колонку Товар_калибр при batchCaption", () => {
    const rows: TripBatchTableRow[] = [
      {
        batchId: "b-1",
        shippedG: 1000n,
        shippedPackages: 0n,
        soldG: 0n,
        shortageG: 0n,
        netTransitG: 1000n,
        revenueK: 0n,
        cashK: 0n,
        debtK: 0n,
      },
    ];
    const csv = tripBatchRowsToCsv(rows, {
      tripNumber: "Т-1",
      tripId: "tid",
      batchCaption: () => "№ 12 · Помидоры · 6+",
    });
    expect(csv).toContain("Товар_калибр");
    expect(csv).toContain("b-1;№ 12 · Помидоры · 6+;1000");
  });
});
