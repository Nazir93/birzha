import { describe, expect, it } from "vitest";

import { planAppendLoadingManifestLineGrams } from "./plan-append-loading-manifest-line-grams.js";

describe("planAppendLoadingManifestLineGrams", () => {
  it("новая партия: строка = весь свободный склад", () => {
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: null,
        availableWarehouseGrams: 30_000n,
      }),
    ).toEqual({ kind: "insert", targetGrams: 30_000n, addGrams: 30_000n });
  });

  it("после возврата: прибавляет склад к уже загруженной строке", () => {
    // Было 100 кг в ПН, вернули 30 кг на склад — в строке 70, на складе 30.
    // Догрузка должна дать строку 100, а не молча пропустить (старый баг: 30 > 70 === false).
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: 70_000n,
        availableWarehouseGrams: 30_000n,
      }),
    ).toEqual({ kind: "increase", targetGrams: 100_000n, addGrams: 30_000n });
  });

  it("догрузка хвоста, когда на складе меньше, чем уже в строке", () => {
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: 500_000n,
        availableWarehouseGrams: 40_000n,
      }),
    ).toEqual({ kind: "increase", targetGrams: 540_000n, addGrams: 40_000n });
  });

  it("нет склада — skip", () => {
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: 70_000n,
        availableWarehouseGrams: 0n,
      }),
    ).toEqual({ kind: "skip" });
  });

  it("частичная догрузка: не больше доступного", () => {
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: null,
        availableWarehouseGrams: 1148_000n,
        requestedAddGrams: 500_000n,
      }),
    ).toEqual({ kind: "insert", targetGrams: 500_000n, addGrams: 500_000n });
    expect(
      planAppendLoadingManifestLineGrams({
        existingLineGrams: 100_000n,
        availableWarehouseGrams: 200_000n,
        requestedAddGrams: 500_000n,
      }),
    ).toEqual({ kind: "increase", targetGrams: 300_000n, addGrams: 200_000n });
  });
});
