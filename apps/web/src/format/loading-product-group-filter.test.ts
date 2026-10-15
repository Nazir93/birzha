import { describe, expect, it } from "vitest";

import type { BatchListItem } from "../api/types.js";
import {
  batchMatchesProductGroupFilter,
  productGroupSelectOptions,
  productGroupsPresentOnBatches,
} from "./loading-product-group-filter.js";

function batch(id: string, productGroup: string | null): BatchListItem {
  return {
    id,
    purchaseId: "p",
    totalKg: 100,
    pricePerKg: 1,
    pendingInboundKg: 0,
    onWarehouseKg: 100,
    inTransitKg: 0,
    soldKg: 0,
    writtenOffKg: 0,
    nakladnaya: {
      documentId: "d",
      warehouseId: "w",
      productGradeCode: "№5",
      productGroup,
      documentNumber: "01",
    },
  };
}

describe("productGroupsPresentOnBatches", () => {
  it("уникальные товары по алфавиту, пустые пропускает", () => {
    expect(
      productGroupsPresentOnBatches([
        batch("1", "Помидоры"),
        batch("2", "Огурцы"),
        batch("3", "Помидоры"),
        batch("4", null),
        batch("5", "  "),
      ]),
    ).toEqual(["Огурцы", "Помидоры"]);
  });
});

describe("batchMatchesProductGroupFilter", () => {
  it("без фильтра — все", () => {
    expect(batchMatchesProductGroupFilter(batch("1", "Огурцы"), "")).toBe(true);
    expect(batchMatchesProductGroupFilter(batch("1", "Огурцы"), null)).toBe(true);
  });

  it("фильтр огурцы — только огурцы и партии без товара", () => {
    expect(batchMatchesProductGroupFilter(batch("1", "Огурцы"), "Огурцы")).toBe(true);
    expect(batchMatchesProductGroupFilter(batch("2", "Помидоры"), "Огурцы")).toBe(false);
    expect(batchMatchesProductGroupFilter(batch("3", null), "Огурцы")).toBe(true);
  });
});

describe("productGroupSelectOptions", () => {
  it("первая строка — все товары", () => {
    expect(productGroupSelectOptions(["Огурцы", "Помидоры"])).toEqual([
      { value: "", label: "— все товары —" },
      { value: "Огурцы", label: "Огурцы" },
      { value: "Помидоры", label: "Помидоры" },
    ]);
  });
});
